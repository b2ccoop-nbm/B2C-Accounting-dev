import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Decimal } from "@prisma/client/runtime/library";
import { Prisma, TransactionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateTransactionDto } from "./dto/create-transaction.dto";

const SHARE_CAPITAL_CODES = ["30130", "3100"];
const CASH_CODES = ["11110", "11130", "1010"];

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  static formatJvNumber(year: number, sequence: number): string {
    return `JV-${year}-${String(sequence).padStart(5, "0")}`;
  }

  /** Preview next JV without consuming the sequence (for voucher form). */
  async peekNextJvNumber(date: Date): Promise<string> {
    const year = date.getFullYear();
    const row = await this.prisma.journalSequence.findUnique({ where: { year } });
    const next = (row?.nextNumber ?? 0) + 1;
    return LedgerService.formatJvNumber(year, next);
  }

  /** Allocate next JV inside an existing Prisma transaction. */
  async allocateJvNumber(tx: Prisma.TransactionClient, date: Date): Promise<string> {
    const year = date.getFullYear();
    const row = await tx.journalSequence.upsert({
      where: { year },
      create: { year, nextNumber: 0 },
      update: {},
    });
    const seq = row.nextNumber + 1;
    await tx.journalSequence.update({
      where: { year },
      data: { nextNumber: seq },
    });
    return LedgerService.formatJvNumber(year, seq);
  }

  listAccounts() {
    return this.prisma.account.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    });
  }

  listTransactions(limit = 50, status?: TransactionStatus) {
    return this.prisma.transaction.findMany({
      where: status ? { status } : undefined,
      take: Math.min(limit, 200),
      orderBy: { transactionDate: "desc" },
      include: {
        fiscalPeriod: true,
        integrationEvent: true,
        entries: { include: { account: true, vendor: true } },
      },
    });
  }

  /** Accountant: submit balanced voucher for treasurer approval. */
  async submitVoucher(dto: CreateTransactionDto, postedByUserId: string) {
    const totalDebit = dto.entries.reduce(
      (sum, e) => sum.plus(new Decimal(e.debit)),
      new Decimal(0),
    );
    const totalCredit = dto.entries.reduce(
      (sum, e) => sum.plus(new Decimal(e.credit)),
      new Decimal(0),
    );

    if (!totalDebit.equals(totalCredit)) {
      throw new BadRequestException(
        `Transaction is unbalanced. Total Debits (₱${totalDebit}) must exactly equal Total Credits (₱${totalCredit}).`,
      );
    }

    const txDate = new Date(dto.date);
    if (Number.isNaN(txDate.getTime())) {
      throw new BadRequestException("Invalid transaction date");
    }

    const period = await this.findOpenFiscalPeriod(txDate);
    if (!period) {
      throw new BadRequestException(
        "Cannot submit transaction. No open fiscal period matches this transaction date.",
      );
    }

    const sourceDocument =
      (dto.sourceDocument ?? dto.reference ?? "").trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const jvNumber = await this.allocateJvNumber(tx, txDate);
      return tx.transaction.create({
        data: {
          jvNumber,
          reference: jvNumber,
          description: dto.description,
          transactionDate: txDate,
          status: TransactionStatus.PENDING_APPROVAL,
          postedBy: postedByUserId,
          source: "VOUCHER",
          fiscalPeriodId: period.id,
          metadata: sourceDocument
            ? ({ sourceDocument } as Prisma.InputJsonValue)
            : undefined,
          entries: {
            create: dto.entries.map((entry) => ({
              accountId: entry.accountId,
              debit: new Decimal(entry.debit),
              credit: new Decimal(entry.credit),
              memberId: entry.memberId ?? null,
              vendorId: entry.vendorId ?? null,
            })),
          },
        },
        include: {
          entries: { include: { account: true } },
          fiscalPeriod: true,
        },
      });
    });
  }

  async approveVoucher(transactionId: string, treasurerUserId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { entries: true, fiscalPeriod: true },
    });

    if (!transaction) {
      throw new NotFoundException("Transaction voucher not found.");
    }
    if (transaction.status !== TransactionStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Cannot approve. Transaction is currently in '${transaction.status}' status.`,
      );
    }
    if (transaction.postedBy === treasurerUserId) {
      throw new ForbiddenException(
        "Security Policy Violation: An accountant cannot authorize their own submitted voucher.",
      );
    }
    if (transaction.fiscalPeriod.isClosed) {
      throw new BadRequestException(
        "Compliance Error: Associated fiscal period has already been closed and locked.",
      );
    }

    const totalDebit = transaction.entries.reduce(
      (sum, e) => sum.plus(new Decimal(e.debit)),
      new Decimal(0),
    );
    const totalCredit = transaction.entries.reduce(
      (sum, e) => sum.plus(new Decimal(e.credit)),
      new Decimal(0),
    );
    if (!totalDebit.equals(totalCredit)) {
      throw new BadRequestException(
        "Database Integrity Error: Debit and credit entries became unbalanced during pending state.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      return tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.POSTED,
          approvedBy: treasurerUserId,
          postedAt: new Date(),
        },
        include: {
          entries: { include: { account: true } },
          fiscalPeriod: true,
        },
      });
    });
  }

  async rejectVoucher(transactionId: string, treasurerUserId: string, reason: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });
    if (!transaction) {
      throw new NotFoundException("Transaction voucher not found.");
    }
    if (transaction.status !== TransactionStatus.PENDING_APPROVAL) {
      throw new BadRequestException("Only pending approval vouchers can be rejected.");
    }

    return this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: TransactionStatus.VOID,
        description: `${transaction.description} (REJECTED by Treasurer: ${reason})`,
        approvedBy: treasurerUserId,
      },
      include: {
        entries: { include: { account: true } },
      },
    });
  }

  async getPendingVouchers() {
    return this.prisma.transaction.findMany({
      where: { status: TransactionStatus.PENDING_APPROVAL },
      include: {
        entries: { include: { account: true, vendor: true } },
        fiscalPeriod: true,
      },
      orderBy: { transactionDate: "asc" },
    });
  }

  async getHierarchicalBalance(accountCode: string): Promise<number> {
    const root = await this.prisma.account.findUnique({ where: { code: accountCode } });
    if (!root) {
      throw new NotFoundException(`Account with code ${accountCode} not found in the COA.`);
    }

    const accountIds = [
      root.id,
      ...(await this.fetchChildAccountIdsRecursively(root.id)),
    ];

    const lines = await this.prisma.journalEntry.findMany({
      where: {
        accountId: { in: accountIds },
        transaction: { status: TransactionStatus.POSTED },
      },
    });

    const debitNormal = ["ASSET", "EXPENSE", "COST_OF_GOODS"].includes(root.type);
    const total = lines.reduce((sum, line) => {
      const debit = new Decimal(line.debit);
      const credit = new Decimal(line.credit);
      return debitNormal ? sum.plus(debit.minus(credit)) : sum.plus(credit.minus(debit));
    }, new Decimal(0));

    return total.toNumber();
  }

  async getTrialBalance(asOf?: string) {
    const when = asOf ? new Date(asOf) : new Date();
    if (Number.isNaN(when.getTime())) {
      throw new BadRequestException("Invalid asOf date");
    }

    const accounts = await this.prisma.account.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    });

    const lines = await this.prisma.journalEntry.findMany({
      where: {
        transaction: {
          status: TransactionStatus.POSTED,
          transactionDate: { lte: when },
        },
      },
      include: { account: true },
    });

    const totals = new Map<string, { debit: Decimal; credit: Decimal; account: (typeof accounts)[0] }>();
    for (const acc of accounts) {
      totals.set(acc.id, { debit: new Decimal(0), credit: new Decimal(0), account: acc });
    }

    for (const line of lines) {
      const bucket = totals.get(line.accountId);
      if (!bucket) continue;
      bucket.debit = bucket.debit.plus(line.debit);
      bucket.credit = bucket.credit.plus(line.credit);
    }

    const debitNormal = new Set(["ASSET", "EXPENSE", "COST_OF_GOODS"]);
    const rows = [...totals.values()]
      .map(({ debit, credit, account }) => {
        const net = debitNormal.has(account.type)
          ? debit.minus(credit)
          : credit.minus(debit);
        if (debit.isZero() && credit.isZero()) return null;
        return {
          code: account.code,
          title: account.title,
          type: account.type,
          debitTotal: debit.toFixed(2),
          creditTotal: credit.toFixed(2),
          balance: net.toFixed(2),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);

    const sumDebit = rows.reduce((s, r) => s.plus(new Decimal(r.debitTotal)), new Decimal(0));
    const sumCredit = rows.reduce((s, r) => s.plus(new Decimal(r.creditTotal)), new Decimal(0));

    return {
      asOf: when.toISOString(),
      currency: "PHP",
      rows,
      totals: {
        debit: sumDebit.toFixed(2),
        credit: sumCredit.toFixed(2),
      },
    };
  }

  async findOpenFiscalPeriod(date: Date) {
    return this.prisma.fiscalPeriod.findFirst({
      where: {
        startDate: { lte: date },
        endDate: { gte: date },
        isClosed: false,
      },
    });
  }

  private async fetchChildAccountIdsRecursively(parentId: string): Promise<string[]> {
    const children = await this.prisma.account.findMany({
      where: { parentId },
      select: { id: true },
    });
    let ids = children.map((c) => c.id);
    for (const child of children) {
      ids = [...ids, ...(await this.fetchChildAccountIdsRecursively(child.id))];
    }
    return ids;
  }

  static isShareCapitalCode(code: string) {
    return SHARE_CAPITAL_CODES.includes(code);
  }

  static isCashCode(code: string) {
    return CASH_CODES.includes(code);
  }
}

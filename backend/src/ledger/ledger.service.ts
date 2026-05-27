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
        integrationEvent: true,
        entries: { include: { account: true } },
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

    return this.prisma.$transaction(async (tx) => {
      return tx.transaction.create({
        data: {
          reference: dto.reference,
          description: dto.description,
          transactionDate: txDate,
          status: TransactionStatus.PENDING_APPROVAL,
          postedBy: postedByUserId,
          fiscalPeriodId: period.id,
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
        entries: { include: { account: true } },
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

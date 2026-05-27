import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, TransactionStatus } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaService } from "../prisma/prisma.service";
import { LedgerService } from "../ledger/ledger.service";
import type { JournalEventDto } from "./dto/journal-event.dto";

export type MemberSearchHit = {
  participantId: string;
  fullName: string | null;
  memberIdNo: string | null;
  email: string | null;
  hasLedgerActivity: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PATRONAGE_PAYABLE_CODE = "21310";

export type JournalEventResult = {
  id: string;
  externalId: string;
  source: string;
  participantId: string;
  occurredAt: string;
  amount: string;
  currency: string;
  memo: string | null;
  lines: Array<{
    accountCode: string;
    accountName: string;
    debit: string;
    credit: string;
  }>;
};

type TxWithLines = Prisma.TransactionGetPayload<{
  include: {
    integrationEvent: true;
    entries: { include: { account: true } };
  };
}>;

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ledger: LedgerService,
  ) {}

  async postJournalEvent(dto: JournalEventDto): Promise<{ created: boolean; entry: JournalEventResult }> {
    const existing = await this.prisma.integrationEvent.findUnique({
      where: { externalId: dto.externalId },
      include: {
        transaction: {
          include: {
            integrationEvent: true,
            entries: { include: { account: true } },
          },
        },
      },
    });
    if (existing) {
      return { created: false, entry: this.toResult(existing.transaction) };
    }

    const rule = await this.prisma.sourcePostingRule.findUnique({
      where: { source: dto.source },
    });
    if (!rule) {
      throw new BadRequestException(`No posting rule for source "${dto.source}"`);
    }

    const accounts = await this.prisma.account.findMany({
      where: { code: { in: [rule.debitCode, rule.creditCode] }, isActive: true },
    });
    const debitAccount = accounts.find((a) => a.code === rule.debitCode);
    const creditAccount = accounts.find((a) => a.code === rule.creditCode);
    if (!debitAccount || !creditAccount) {
      throw new BadRequestException(
        `Chart accounts missing for source "${dto.source}" (${rule.debitCode} / ${rule.creditCode})`,
      );
    }

    const amount = new Decimal(dto.amount);
    const occurredAt = new Date(dto.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException("Invalid occurredAt");
    }

    const period = await this.ledger.findOpenFiscalPeriod(occurredAt);
    if (!period) {
      throw new BadRequestException("No open fiscal period for occurredAt date");
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      const jvNumber = await this.ledger.allocateJvNumber(tx, occurredAt);
      const created = await tx.transaction.create({
        data: {
          jvNumber,
          reference: dto.externalId,
          description: dto.memo ?? dto.source,
          transactionDate: occurredAt,
          postedAt: occurredAt,
          status: TransactionStatus.POSTED,
          postedBy: "system:integration",
          source: dto.source,
          participantId: dto.participantId,
          currency: dto.currency,
          amount,
          memo: dto.memo ?? null,
          metadata: dto.metadata ? (dto.metadata as Prisma.InputJsonValue) : undefined,
          fiscalPeriodId: period.id,
          integrationEvent: {
            create: {
              externalId: dto.externalId,
              source: dto.source,
            },
          },
          entries: {
            create: [
              {
                accountId: debitAccount.id,
                memberId: dto.participantId,
                debit: amount,
                credit: new Decimal(0),
              },
              {
                accountId: creditAccount.id,
                memberId: dto.participantId,
                debit: new Decimal(0),
                credit: amount,
              },
            ],
          },
        },
        include: {
          integrationEvent: true,
          entries: { include: { account: true } },
        },
      });
      return created;
    });

    return { created: true, entry: this.toResult(transaction) };
  }

  async getMemberPatronageSummary(participantId: string) {
    const patronageLines = await this.prisma.journalEntry.findMany({
      where: {
        memberId: participantId,
        account: { code: PATRONAGE_PAYABLE_CODE },
        transaction: { status: TransactionStatus.POSTED },
      },
      include: {
        account: true,
        transaction: { include: { integrationEvent: true } },
      },
      orderBy: { transaction: { transactionDate: "desc" } },
    });

    let patronageAccruedBalance = new Decimal(0);
    const accrualByTx = new Map<
      string,
      {
        transactionId: string;
        externalId: string;
        occurredAt: string;
        source: string | null;
        memo: string | null;
        grossAmount: string | null;
        patronageAmount: string;
      }
    >();

    for (const line of patronageLines) {
      patronageAccruedBalance = patronageAccruedBalance
        .add(new Decimal(line.credit))
        .sub(new Decimal(line.debit));

      const tx = line.transaction;
      const meta = (tx.metadata ?? {}) as Record<string, unknown>;
      const patronageFromMeta =
        typeof meta.patronageAmount === "string"
          ? meta.patronageAmount
          : typeof meta.patronageAmount === "number"
            ? meta.patronageAmount.toFixed(2)
            : new Decimal(line.credit).sub(new Decimal(line.debit)).toFixed(2);

      const existing = accrualByTx.get(tx.id);
      const lineNet = new Decimal(line.credit).sub(new Decimal(line.debit));
      if (existing) {
        existing.patronageAmount = new Decimal(existing.patronageAmount).add(lineNet).toFixed(2);
        continue;
      }

      accrualByTx.set(tx.id, {
        transactionId: tx.id,
        externalId: tx.integrationEvent?.externalId ?? tx.reference,
        occurredAt: (tx.postedAt ?? tx.transactionDate).toISOString(),
        source: tx.source,
        memo: tx.memo,
        grossAmount: tx.amount?.toFixed(2) ?? null,
        patronageAmount: patronageFromMeta,
      });
    }

    const accruals = [...accrualByTx.values()].filter((a) => Number(a.patronageAmount) > 0);
    const lastAccrualAt = accruals[0]?.occurredAt ?? null;

    return {
      participantId,
      currency: "PHP",
      patronageAccruedBalance: patronageAccruedBalance.toFixed(2),
      patronageExpenseTotal: patronageAccruedBalance.toFixed(2),
      purchaseCount: accruals.length,
      lastAccrualAt,
      accruals,
      note:
        accruals.length === 0
          ? "No patronage accruals yet — shop at the Coop store to earn patronage refunds on purchases."
          : null,
    };
  }

  async getMemberLedger(participantId: string) {
    let summary: Awaited<ReturnType<IntegrationsService["getMemberSummary"]>> | null = null;
    try {
      summary = await this.getMemberSummary(participantId);
    } catch (e) {
      if (!(e instanceof NotFoundException)) throw e;
    }

    const patronage = await this.getMemberPatronageSummary(participantId);

    const txIds = new Set<string>();
    const byParticipant = await this.prisma.transaction.findMany({
      where: { participantId, status: TransactionStatus.POSTED },
      select: { id: true },
    });
    for (const t of byParticipant) txIds.add(t.id);

    const byLine = await this.prisma.journalEntry.findMany({
      where: { memberId: participantId, transaction: { status: TransactionStatus.POSTED } },
      select: { transactionId: true },
      distinct: ["transactionId"],
    });
    for (const l of byLine) txIds.add(l.transactionId);

    const transactions =
      txIds.size === 0
        ? []
        : await this.prisma.transaction.findMany({
            where: { id: { in: [...txIds] }, status: TransactionStatus.POSTED },
            orderBy: { transactionDate: "desc" },
            take: 40,
            include: {
              fiscalPeriod: true,
              integrationEvent: true,
              entries: { include: { account: true, vendor: true } },
            },
          });

    return {
      participantId,
      summary,
      patronage,
      transactions,
      entryCount: transactions.length,
    };
  }

  async getMemberSummary(participantId: string) {
    const transactions = await this.prisma.transaction.findMany({
      where: { participantId, status: TransactionStatus.POSTED },
      orderBy: { transactionDate: "desc" },
      include: { entries: { include: { account: true } } },
    });

    if (transactions.length === 0) {
      throw new NotFoundException("No ledger activity for this participant");
    }

    let shareCapital = new Decimal(0);
    let cashReceived = new Decimal(0);

    for (const tx of transactions) {
      for (const line of tx.entries) {
        if (LedgerService.isShareCapitalCode(line.account.code)) {
          shareCapital = shareCapital.add(line.credit).sub(line.debit);
        }
        if (LedgerService.isCashCode(line.account.code)) {
          cashReceived = cashReceived.add(line.debit).sub(line.credit);
        }
      }
    }

    const last = transactions[0];
    const meta = (last.metadata ?? {}) as Record<string, unknown>;

    return {
      participantId,
      currency: last.currency,
      shareCapitalBalance: shareCapital.toFixed(2),
      cashReceivedTotal: cashReceived.toFixed(2),
      lastPaymentAt: (last.postedAt ?? last.transactionDate).toISOString(),
      lastSource: last.source,
      lastAmount: last.amount?.toFixed(2) ?? "0.00",
      lastMemo: last.memo,
      memberIdNo: typeof meta.memberIdNo === "string" ? meta.memberIdNo : null,
      email: typeof meta.email === "string" ? meta.email : null,
      firstName: typeof meta.firstName === "string" ? meta.firstName : null,
      lastName: typeof meta.lastName === "string" ? meta.lastName : null,
      entryCount: transactions.length,
    };
  }

  async searchMembers(
    params: { q?: string; firstName?: string; lastName?: string; memberId?: string },
    staffBearerToken: string,
  ): Promise<{ query: string; results: MemberSearchHit[] }> {
    const query = this.buildMemberSearchQuery(params);
    if (!query.trim()) {
      throw new BadRequestException("Enter a last name, first name, member ID, or participant UUID");
    }

    const trimmed = query.trim();
    if (UUID_RE.test(trimmed)) {
      const summary = await this.safeMemberSummary(trimmed);
      return {
        query: trimmed,
        results: [
          {
            participantId: trimmed,
            fullName: summary
              ? [summary.firstName, summary.lastName].filter(Boolean).join(" ") || null
              : null,
            memberIdNo: summary?.memberIdNo ?? null,
            email: summary?.email ?? null,
            hasLedgerActivity: Boolean(summary),
          },
        ],
      };
    }

    const hits = new Map<string, MemberSearchHit>();

    for (const row of await this.searchWebAppRegistry(trimmed, staffBearerToken)) {
      hits.set(row.participantId, row);
    }
    for (const row of await this.searchLocalLedgerMembers(trimmed)) {
      const existing = hits.get(row.participantId);
      if (existing) {
        existing.hasLedgerActivity = true;
        if (!existing.memberIdNo && row.memberIdNo) existing.memberIdNo = row.memberIdNo;
        if (!existing.email && row.email) existing.email = row.email;
        if (!existing.fullName && row.fullName) existing.fullName = row.fullName;
      } else {
        hits.set(row.participantId, row);
      }
    }

    const results = [...hits.values()].slice(0, 25);
    if (results.length === 0) {
      throw new NotFoundException(`No members found for "${trimmed}"`);
    }
    return { query: trimmed, results };
  }

  private buildMemberSearchQuery(params: {
    q?: string;
    firstName?: string;
    lastName?: string;
    memberId?: string;
  }): string {
    const memberId = params.memberId?.trim();
    if (memberId) return memberId;
    const q = params.q?.trim();
    if (q) return q;
    const first = params.firstName?.trim();
    const last = params.lastName?.trim();
    if (first && last) return `${first} ${last}`;
    if (last) return last;
    if (first) return first;
    return "";
  }

  private async searchWebAppRegistry(q: string, staffBearerToken: string): Promise<MemberSearchHit[]> {
    const base = String(this.config.get<string>("WEBAPP_API_URL") ?? "").replace(/\/$/, "");
    if (!base) return [];

    const url = new URL(`${base}/pmes/admin/member-registry`);
    url.searchParams.set("q", q);
    url.searchParams.set("includeAll", "true");
    url.searchParams.set("pageSize", "25");

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: {
          Authorization: staffBearerToken.startsWith("Bearer ")
            ? staffBearerToken
            : `Bearer ${staffBearerToken}`,
        },
      });
    } catch {
      return [];
    }
    if (!res.ok) return [];

    const data = (await res.json()) as {
      rows?: Array<{
        participantId: string;
        fullName?: string;
        memberIdNo?: string | null;
        email?: string;
      }>;
    };

    const ledgerIds = await this.participantIdsWithLedger(
      (data.rows ?? []).map((r) => r.participantId),
    );

    return (data.rows ?? []).map((r) => ({
      participantId: r.participantId,
      fullName: r.fullName?.trim() || null,
      memberIdNo: r.memberIdNo?.trim() || null,
      email: r.email?.trim().toLowerCase() || null,
      hasLedgerActivity: ledgerIds.has(r.participantId),
    }));
  }

  private async searchLocalLedgerMembers(q: string): Promise<MemberSearchHit[]> {
    const needle = q.toLowerCase();
    const transactions = await this.prisma.transaction.findMany({
      where: { participantId: { not: null }, status: TransactionStatus.POSTED },
      orderBy: { transactionDate: "desc" },
      distinct: ["participantId"],
      take: 200,
    });

    const results: MemberSearchHit[] = [];
    for (const tx of transactions) {
      if (!tx.participantId) continue;
      const meta = (tx.metadata ?? {}) as Record<string, unknown>;
      const memberIdNo = typeof meta.memberIdNo === "string" ? meta.memberIdNo : null;
      const email = typeof meta.email === "string" ? meta.email : null;
      const firstName = typeof meta.firstName === "string" ? meta.firstName : null;
      const lastName = typeof meta.lastName === "string" ? meta.lastName : null;
      const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;

      const haystack = [tx.participantId, memberIdNo, email, fullName, firstName, lastName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(needle)) continue;

      results.push({
        participantId: tx.participantId,
        fullName,
        memberIdNo,
        email,
        hasLedgerActivity: true,
      });
    }
    return results;
  }

  private async participantIdsWithLedger(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.transaction.findMany({
      where: { participantId: { in: ids }, status: TransactionStatus.POSTED },
      select: { participantId: true },
      distinct: ["participantId"],
    });
    return new Set(rows.map((r) => r.participantId).filter(Boolean) as string[]);
  }

  private async safeMemberSummary(participantId: string) {
    try {
      return await this.getMemberSummary(participantId);
    } catch {
      return null;
    }
  }

  private toResult(tx: TxWithLines): JournalEventResult {
    return {
      id: tx.id,
      externalId: tx.integrationEvent?.externalId ?? tx.reference,
      source: tx.source ?? "",
      participantId: tx.participantId ?? "",
      occurredAt: tx.transactionDate.toISOString(),
      amount: tx.amount?.toFixed(2) ?? "0.00",
      currency: tx.currency,
      memo: tx.memo,
      lines: tx.entries.map((l) => ({
        accountCode: l.account.code,
        accountName: l.account.title,
        debit: l.debit.toFixed(2),
        credit: l.credit.toFixed(2),
      })),
    };
  }
}

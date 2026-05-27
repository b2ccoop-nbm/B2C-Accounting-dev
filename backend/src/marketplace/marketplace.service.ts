import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TransactionStatus } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { LedgerService } from "../ledger/ledger.service";
import { PrismaService } from "../prisma/prisma.service";
import type { MarketplaceSaleDto } from "./dto/marketplace-sale.dto";

const SALE_SOURCE = "commerce.sale";
const SALES_CODE = "40310";
const AP_CODE = "21210";
const DEFAULT_CASH_CODE = "11110";

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  listVendors() {
    return this.prisma.vendor.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        products: { where: { isActive: true }, orderBy: { name: "asc" } },
      },
    });
  }

  async getVendorApBalance(vendorCode: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { code: vendorCode } });
    if (!vendor) {
      throw new NotFoundException(`Vendor ${vendorCode} not found`);
    }

    const apAccount = await this.prisma.account.findUnique({ where: { code: AP_CODE } });
    if (!apAccount) {
      throw new NotFoundException(`Account ${AP_CODE} not found in COA`);
    }

    const lines = await this.prisma.journalEntry.findMany({
      where: {
        vendorId: vendor.id,
        accountId: apAccount.id,
        transaction: { status: TransactionStatus.POSTED },
      },
    });

    const balance = lines.reduce(
      (sum, line) => sum.plus(new Decimal(line.credit)).minus(new Decimal(line.debit)),
      new Decimal(0),
    );

    return {
      vendorCode: vendor.code,
      vendorName: vendor.name,
      accountCode: AP_CODE,
      payableBalance: balance.toFixed(2),
      currency: "PHP",
    };
  }

  async postMarketplaceSale(dto: MarketplaceSaleDto) {
    const existing = await this.prisma.integrationEvent.findUnique({
      where: { externalId: dto.externalId },
      include: {
        transaction: {
          include: { integrationEvent: true, entries: { include: { account: true } } },
        },
      },
    });
    if (existing) {
      return { created: false, entry: this.toResult(existing.transaction) };
    }

    const vendor = await this.prisma.vendor.findUnique({
      where: { code: dto.vendorCode.trim() },
    });
    if (!vendor || !vendor.isActive) {
      throw new NotFoundException(`Active vendor "${dto.vendorCode}" not found`);
    }

    const gross = new Decimal(dto.grossAmount);
    const sales = new Decimal(dto.salesAmount);
    const payable = new Decimal(dto.vendorPayableAmount);
    if (!gross.equals(sales.plus(payable))) {
      throw new BadRequestException(
        `grossAmount (₱${gross}) must equal salesAmount (₱${sales}) + vendorPayableAmount (₱${payable})`,
      );
    }
    if (gross.lte(0)) {
      throw new BadRequestException("grossAmount must be positive");
    }

    const cashCode = (dto.cashAccountCode?.trim() || DEFAULT_CASH_CODE).toUpperCase();
    const accounts = await this.prisma.account.findMany({
      where: { code: { in: [cashCode, SALES_CODE, AP_CODE] }, isActive: true },
    });
    const cash = accounts.find((a) => a.code === cashCode);
    const salesAcct = accounts.find((a) => a.code === SALES_CODE);
    const apAcct = accounts.find((a) => a.code === AP_CODE);
    if (!cash || !salesAcct || !apAcct) {
      throw new BadRequestException(`Missing COA accounts for marketplace sale (${cashCode}, ${SALES_CODE}, ${AP_CODE})`);
    }

    const occurredAt = new Date(dto.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException("Invalid occurredAt");
    }

    const period = await this.ledger.findOpenFiscalPeriod(occurredAt);
    if (!period) {
      throw new BadRequestException("No open fiscal period for occurredAt date");
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      return tx.transaction.create({
        data: {
          reference: dto.externalId,
          description: dto.memo ?? `Marketplace sale — ${vendor.name}`,
          transactionDate: occurredAt,
          postedAt: occurredAt,
          status: TransactionStatus.POSTED,
          postedBy: "system:integration",
          source: SALE_SOURCE,
          participantId: dto.buyerParticipantId ?? null,
          currency: dto.currency,
          amount: gross,
          memo: dto.memo ?? null,
          metadata: {
            ...(dto.metadata ?? {}),
            vendorCode: vendor.code,
            vendorName: vendor.name,
            salesAmount: sales.toFixed(2),
            vendorPayableAmount: payable.toFixed(2),
          } as Prisma.InputJsonValue,
          fiscalPeriodId: period.id,
          integrationEvent: {
            create: {
              externalId: dto.externalId,
              source: SALE_SOURCE,
            },
          },
          entries: {
            create: [
              {
                accountId: cash.id,
                memberId: dto.buyerParticipantId ?? null,
                debit: gross,
                credit: new Decimal(0),
              },
              {
                accountId: salesAcct.id,
                memberId: dto.buyerParticipantId ?? null,
                debit: new Decimal(0),
                credit: sales,
              },
              {
                accountId: apAcct.id,
                vendorId: vendor.id,
                debit: new Decimal(0),
                credit: payable,
              },
            ],
          },
        },
        include: {
          integrationEvent: true,
          entries: { include: { account: true } },
        },
      });
    });

    return { created: true, entry: this.toResult(transaction) };
  }

  private toResult(
    tx: Prisma.TransactionGetPayload<{
      include: { integrationEvent: true; entries: { include: { account: true } } };
    }>,
  ) {
    return {
      id: tx.id,
      externalId: tx.integrationEvent?.externalId ?? tx.reference,
      source: tx.source ?? SALE_SOURCE,
      participantId: tx.participantId,
      occurredAt: tx.transactionDate.toISOString(),
      amount: tx.amount?.toFixed(2) ?? "0.00",
      currency: tx.currency,
      memo: tx.memo,
      lines: tx.entries.map((l) => ({
        accountCode: l.account.code,
        accountName: l.account.title,
        debit: l.debit.toFixed(2),
        credit: l.credit.toFixed(2),
        vendorId: l.vendorId,
        memberId: l.memberId,
      })),
    };
  }
}

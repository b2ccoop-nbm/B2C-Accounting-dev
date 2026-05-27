import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { TransactionStatus } from "@prisma/client";
import type { StaffJwtPayload } from "../auth/staff-jwt.guard";
import { StaffJwtGuard } from "../auth/staff-jwt.guard";
import { CreateTransactionDto } from "./dto/create-transaction.dto";
import { RejectVoucherDto } from "./dto/reject-voucher.dto";
import { LedgerService } from "./ledger.service";

type StaffRequest = Request & { staffUser?: StaffJwtPayload };

@Controller("ledger")
@UseGuards(StaffJwtGuard)
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get("accounts")
  listAccounts() {
    return this.ledger.listAccounts();
  }

  @Get("journals")
  listJournals(@Query("limit") limit?: string, @Query("status") status?: string) {
    const n = limit ? parseInt(limit, 10) : 50;
    const st = status && Object.values(TransactionStatus).includes(status as TransactionStatus)
      ? (status as TransactionStatus)
      : undefined;
    return this.ledger.listTransactions(Number.isFinite(n) ? n : 50, st);
  }

  /** Next JV number preview (does not consume sequence until voucher is saved). */
  @Get("journals/next-jv")
  peekNextJv(@Query("date") date?: string) {
    const parsed = date ? new Date(date) : new Date();
    const when = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    return this.ledger.peekNextJvNumber(when).then((jvNumber) => ({ jvNumber }));
  }

  @Get("vouchers/pending")
  getPendingVouchers() {
    return this.ledger.getPendingVouchers();
  }

  @Post("vouchers")
  submitVoucher(@Body() dto: CreateTransactionDto, @Req() req: StaffRequest) {
    const staff = req.staffUser;
    if (!staff?.sub) throw new UnauthorizedException("Staff context missing");
    return this.ledger.submitVoucher(dto, staff.sub);
  }

  @Post("vouchers/:id/approve")
  approveVoucher(@Param("id") id: string, @Req() req: StaffRequest) {
    const staff = req.staffUser;
    if (!staff?.sub) throw new UnauthorizedException("Staff context missing");
    return this.ledger.approveVoucher(id, staff.sub);
  }

  @Post("vouchers/:id/reject")
  rejectVoucher(
    @Param("id") id: string,
    @Body() dto: RejectVoucherDto,
    @Req() req: StaffRequest,
  ) {
    const staff = req.staffUser;
    if (!staff?.sub) throw new UnauthorizedException("Staff context missing");
    return this.ledger.rejectVoucher(id, staff.sub, dto.reason);
  }

  @Get("accounts/:code/balance")
  getAccountBalance(@Param("code") code: string) {
    return this.ledger.getHierarchicalBalance(code).then((balance) => ({ code, balance }));
  }

  @Get("reports/trial-balance")
  getTrialBalance(@Query("asOf") asOf?: string) {
    return this.ledger.getTrialBalance(asOf);
  }
}

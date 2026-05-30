import { Controller, Get, Post, Req, UnauthorizedException, UseGuards, Body } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { FirebaseSessionDto } from "./dto/firebase-session.dto";
import type { StaffJwtPayload } from "./staff-jwt.guard";
import { StaffJwtGuard } from "./staff-jwt.guard";

type StaffRequest = Request & { staffUser?: StaffJwtPayload };

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Staff UI: exchange Firebase ID token for accounting staff JWT */
  @Post("firebase/session")
  firebaseSession(@Body() dto: FirebaseSessionDto) {
    return this.auth.exchangeFirebaseSession(dto.idToken);
  }

  /** Refresh session profile (email + role) when UI has JWT but lost in-memory state */
  @Get("me")
  @UseGuards(StaffJwtGuard)
  me(@Req() req: StaffRequest) {
    const sub = req.staffUser?.sub;
    if (!sub) throw new UnauthorizedException("Staff context missing");
    return this.auth.getStaffSession(sub);
  }
}

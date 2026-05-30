import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

import { isStaffJwtRole, type StaffJwtRole } from "./staff-roles";

export type { StaffJwtRole };
export type StaffJwtPayload = {
  sub: string;
  role: StaffJwtRole;
  superuser?: boolean;
};

@Injectable()
export class StaffJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { staffUser?: StaffJwtPayload }>();
    const raw = req.headers.authorization;
    const header = String(Array.isArray(raw) ? raw[0] : raw ?? "");
    const token = header.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      throw new UnauthorizedException("Missing Bearer token");
    }
    try {
      const secret = this.config.get<string>("ADMIN_JWT_SECRET");
      const payload = this.jwt.verify<{
        role?: string;
        sub?: string;
        superuser?: boolean;
      }>(token, { secret });
      const roleRaw = payload?.role;
      if (typeof roleRaw !== "string" || !isStaffJwtRole(roleRaw)) {
        throw new UnauthorizedException("Not an authorized staff token");
      }
      if (!payload?.sub) {
        throw new UnauthorizedException("Invalid staff token");
      }
      req.staffUser = {
        sub: payload.sub,
        role: roleRaw as StaffJwtRole,
        superuser: payload.superuser === true,
      };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired staff token");
    }
  }
}

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { StaffJwtPayload, StaffJwtRole } from "./staff-jwt.guard";

/** Accepts WebApp staff JWT or INTEGRATION_SERVICE_SECRET as Bearer token. */
@Injectable()
export class IntegrationAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<
      Request & { staffUser?: StaffJwtPayload; integrationService?: boolean }
    >();
    const raw = req.headers.authorization;
    const header = String(Array.isArray(raw) ? raw[0] : raw ?? "");
    const token = header.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      throw new UnauthorizedException("Missing Bearer token");
    }

    const serviceSecret = String(this.config.get<string>("INTEGRATION_SERVICE_SECRET") ?? "");
    if (serviceSecret && token === serviceSecret) {
      req.integrationService = true;
      return true;
    }

    try {
      const secret = this.config.get<string>("ADMIN_JWT_SECRET");
      const payload = this.jwt.verify<{ role?: string; sub?: string }>(token, { secret });
      const allowed: StaffJwtRole[] = ["superuser", "admin", "treasurer"];
      const roleRaw = payload?.role;
      if (typeof roleRaw !== "string" || !allowed.includes(roleRaw as StaffJwtRole)) {
        throw new UnauthorizedException("Staff role not permitted for integration writes");
      }
      if (!payload?.sub) {
        throw new UnauthorizedException("Invalid staff token");
      }
      req.staffUser = { sub: payload.sub, role: roleRaw as StaffJwtRole };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid integration credentials");
    }
  }
}

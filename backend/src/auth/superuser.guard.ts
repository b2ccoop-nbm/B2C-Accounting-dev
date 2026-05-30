import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import type { StaffJwtPayload } from "./staff-jwt.guard";
import { canManageStaffAccess } from "./staff-roles";

@Injectable()
export class SuperuserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { staffUser?: StaffJwtPayload }>();
    const role = req.staffUser?.role;
    if (!role || !canManageStaffAccess(role)) {
      throw new ForbiddenException("Superuser access required");
    }
    return true;
  }
}

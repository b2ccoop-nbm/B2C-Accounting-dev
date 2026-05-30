import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import type { StaffJwtPayload } from "./staff-jwt.guard";
import { hasSuperuserAuthorization } from "./staff-roles";

@Injectable()
export class SuperuserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { staffUser?: StaffJwtPayload }>();
    const user = req.staffUser;
    if (!user?.role || !hasSuperuserAuthorization(user)) {
      throw new ForbiddenException("Superuser access required");
    }
    return true;
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import type { StaffJwtPayload } from "../auth/staff-jwt.guard";
import { StaffJwtGuard } from "../auth/staff-jwt.guard";
import { SuperuserGuard } from "../auth/superuser.guard";
import { ASSIGNABLE_STAFF_ROLES, STAFF_ROLE_LABELS } from "../auth/staff-roles";
import { UpsertStaffDto } from "./dto/upsert-staff.dto";
import { UpdateStaffDto } from "./dto/update-staff.dto";
import { StaffService } from "./staff.service";

type StaffRequest = Request & { staffUser?: StaffJwtPayload };

@Controller("staff")
@UseGuards(StaffJwtGuard, SuperuserGuard)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get("roles")
  listAssignableRoles() {
    return ASSIGNABLE_STAFF_ROLES.map((role) => ({
      role,
      label: STAFF_ROLE_LABELS[role],
    }));
  }

  @Get()
  list() {
    return this.staff.list();
  }

  @Post()
  create(@Body() dto: UpsertStaffDto) {
    return this.staff.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateStaffDto, @Req() req: StaffRequest) {
    const actor = req.staffUser;
    if (!actor?.sub) throw new UnauthorizedException("Staff context missing");
    return this.staff.update(id, dto, actor.sub);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: StaffRequest) {
    const actor = req.staffUser;
    if (!actor?.sub) throw new UnauthorizedException("Staff context missing");
    return this.staff.remove(id, actor.sub);
  }
}

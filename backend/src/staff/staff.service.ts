import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { StaffRole } from "@prisma/client";
import { ASSIGNABLE_STAFF_ROLES, STAFF_ROLE_LABELS } from "../auth/staff-roles";
import { PrismaService } from "../prisma/prisma.service";
import type { UpsertStaffDto } from "./dto/upsert-staff.dto";
import type { UpdateStaffDto } from "./dto/update-staff.dto";

export type StaffUserRow = {
  id: string;
  email: string;
  role: StaffRole;
  roleLabel: string;
  isSuperuser: boolean;
  firebaseUid: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  private toRow(row: {
    id: string;
    email: string;
    role: StaffRole;
    isSuperuser: boolean;
    firebaseUid: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): StaffUserRow {
    return {
      ...row,
      roleLabel: STAFF_ROLE_LABELS[row.role] ?? row.role,
    };
  }

  private hasSuperuserAuth(row: { role: StaffRole; isSuperuser: boolean }): boolean {
    return row.isSuperuser || row.role === StaffRole.SUPERUSER;
  }

  async list(): Promise<StaffUserRow[]> {
    const rows = await this.prisma.staffUser.findMany({
      orderBy: [{ role: "asc" }, { email: "asc" }],
    });
    return rows.map((r) => this.toRow(r));
  }

  async create(dto: UpsertStaffDto): Promise<StaffUserRow> {
    const email = dto.email.trim().toLowerCase();
    this.assertAssignableRole(dto.role);
    try {
      const row = await this.prisma.staffUser.create({
        data: {
          email,
          role: dto.role,
          isSuperuser: dto.isSuperuser === true,
        },
      });
      return this.toRow(row);
    } catch (e: unknown) {
      if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
        throw new ConflictException("That email already has accounting access");
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateStaffDto, actorStaffId: string): Promise<StaffUserRow> {
    const existing = await this.prisma.staffUser.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Staff user not found");

    const nextRole = dto.role ?? existing.role;
    const nextSuperuser =
      dto.isSuperuser !== undefined ? dto.isSuperuser : existing.isSuperuser;

    if (dto.role === StaffRole.SUPERUSER) {
      throw new ForbiddenException(
        "Cannot set role SUPERUSER via API — use scripts/add-staff.js",
      );
    }
    if (dto.role) this.assertAssignableRole(dto.role);

    const losingSuperuser =
      this.hasSuperuserAuth(existing) && !this.hasSuperuserAuth({ role: nextRole, isSuperuser: nextSuperuser });
    if (losingSuperuser) {
      await this.assertNotLastSuperuserAuth(existing.id);
      if (existing.id === actorStaffId) {
        throw new ForbiddenException("You cannot remove your own superuser authorization");
      }
    }

    const row = await this.prisma.staffUser.update({
      where: { id },
      data: {
        ...(dto.role ? { role: dto.role } : {}),
        ...(dto.isSuperuser !== undefined ? { isSuperuser: dto.isSuperuser } : {}),
      },
    });
    return this.toRow(row);
  }

  async remove(id: string, actorStaffId: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.staffUser.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Staff user not found");

    if (this.hasSuperuserAuth(existing)) {
      await this.assertNotLastSuperuserAuth(existing.id);
      if (existing.id === actorStaffId) {
        throw new ForbiddenException("You cannot remove your own superuser access");
      }
    }

    await this.prisma.staffUser.delete({ where: { id } });
    return { deleted: true };
  }

  private assertAssignableRole(role: StaffRole): void {
    if (role === StaffRole.SUPERUSER) {
      throw new ForbiddenException("Use scripts/add-staff.js to add a superuser role");
    }
    if (!ASSIGNABLE_STAFF_ROLES.includes(role)) {
      throw new BadRequestException("Invalid role for assignment");
    }
  }

  private async assertNotLastSuperuserAuth(excludeId?: string): Promise<void> {
    const rows = await this.prisma.staffUser.findMany({
      where: excludeId ? { NOT: { id: excludeId } } : {},
      select: { role: true, isSuperuser: true },
    });
    const count = rows.filter((r) => this.hasSuperuserAuth(r)).length;
    if (count < 1) {
      throw new ForbiddenException("At least one superuser authorization must remain");
    }
  }
}

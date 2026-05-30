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
    firebaseUid: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): StaffUserRow {
    return {
      ...row,
      roleLabel: STAFF_ROLE_LABELS[row.role] ?? row.role,
    };
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
        data: { email, role: dto.role },
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

    if (existing.role === StaffRole.SUPERUSER && dto.role !== StaffRole.SUPERUSER) {
      await this.assertNotLastSuperuser(existing.id);
      if (existing.id === actorStaffId) {
        throw new ForbiddenException("You cannot remove your own superuser access");
      }
    }

    if (dto.role === StaffRole.SUPERUSER) {
      throw new ForbiddenException(
        "Cannot promote to superuser via API — use node scripts/add-staff.js",
      );
    }

    this.assertAssignableRole(dto.role);

    const row = await this.prisma.staffUser.update({
      where: { id },
      data: { role: dto.role },
    });
    return this.toRow(row);
  }

  async remove(id: string, actorStaffId: string): Promise<{ deleted: true }> {
    const existing = await this.prisma.staffUser.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Staff user not found");

    if (existing.role === StaffRole.SUPERUSER) {
      await this.assertNotLastSuperuser(existing.id);
      if (existing.id === actorStaffId) {
        throw new ForbiddenException("You cannot remove your own superuser access");
      }
    }

    await this.prisma.staffUser.delete({ where: { id } });
    return { deleted: true };
  }

  private assertAssignableRole(role: StaffRole): void {
    if (role === StaffRole.SUPERUSER) {
      throw new ForbiddenException("Use scripts/add-staff.js to add a superuser");
    }
    if (!ASSIGNABLE_STAFF_ROLES.includes(role)) {
      throw new BadRequestException("Invalid role for assignment");
    }
  }

  private async assertNotLastSuperuser(excludeId?: string): Promise<void> {
    const count = await this.prisma.staffUser.count({
      where: {
        role: StaffRole.SUPERUSER,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
    });
    if (count < 1) {
      throw new ForbiddenException("At least one superuser must remain");
    }
  }
}

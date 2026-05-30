import { StaffRole } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateStaffDto {
  @IsEnum(StaffRole)
  role!: StaffRole;
}

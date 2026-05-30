import { StaffRole } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional } from "class-validator";

export class UpdateStaffDto {
  @IsOptional()
  @IsEnum(StaffRole)
  role?: StaffRole;

  @IsOptional()
  @IsBoolean()
  isSuperuser?: boolean;
}

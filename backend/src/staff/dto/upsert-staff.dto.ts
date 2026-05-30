import { StaffRole } from "@prisma/client";
import { IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional } from "class-validator";

export class UpsertStaffDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsEnum(StaffRole)
  role!: StaffRole;

  @IsOptional()
  @IsBoolean()
  isSuperuser?: boolean;
}

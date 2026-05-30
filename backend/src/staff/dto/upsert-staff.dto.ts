import { StaffRole } from "@prisma/client";
import { IsEmail, IsEnum, IsNotEmpty } from "class-validator";

export class UpsertStaffDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsEnum(StaffRole)
  role!: StaffRole;
}

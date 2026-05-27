import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class RejectVoucherDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  reason!: string;
}

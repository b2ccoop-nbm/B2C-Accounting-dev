import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

export class JournalLineInputDto {
  @IsUUID()
  accountId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  debit!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  credit!: number;

  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @IsString()
  vendorId?: string;
}

export class CreateTransactionDto {
  @IsDateString()
  date!: string;

  /** Optional supporting document (OR, SI, check no.) — JV number is assigned by the system. */
  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  sourceDocument?: string;

  @IsString()
  description!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineInputDto)
  entries!: JournalLineInputDto[];
}

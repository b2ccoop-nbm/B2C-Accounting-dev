import {
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";

export class MarketplaceSaleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  externalId!: string;

  @IsISO8601()
  occurredAt!: string;

  @IsString()
  @MaxLength(8)
  currency!: string;

  /** Total cash received (must equal salesAmount + vendorPayableAmount). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  grossAmount!: number;

  /** Coop revenue → account 40310 Sales. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salesAmount!: number;

  /** Amount owed to vendor → account 21210 Accounts Payable - Trade. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  vendorPayableAmount!: number;

  /** Optional: cost of goods sold accrual (Dr COGS, Cr Inventory). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cogsAmount?: number;

  /** Optional: patronage accrual (Dr patronage expense, Cr patronage payable). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  patronageAmount?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  vendorCode!: string;

  @IsOptional()
  @IsUUID()
  buyerParticipantId?: string;

  /** Default 11110 Cash on Hand. */
  @IsOptional()
  @IsString()
  @MaxLength(16)
  cashAccountCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  memo?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

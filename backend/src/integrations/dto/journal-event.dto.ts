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
} from "class-validator";

export class JournalEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  source!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  externalId!: string;

  @IsUUID()
  participantId!: string;

  @IsISO8601()
  occurredAt!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @IsString()
  @MaxLength(8)
  currency!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  memo?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

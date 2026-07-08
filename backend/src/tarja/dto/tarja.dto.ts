import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DamageAffects, DamageMoment, DamageOperation, DamageSource } from '@prisma/client';

export class StartTarjaDto {
  @IsInt()
  operationId: number;

  @IsString()
  @MinLength(1)
  vin: string;

  @IsOptional()
  @IsString()
  bl?: string;
}

export class AccessoryItemDto {
  @IsInt()
  accessoryId: number;

  @IsBoolean()
  hasAccessory: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number;
}

export class SetAccessoriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccessoryItemDto)
  items: AccessoryItemDto[];
}

export class SetDamagesDto {
  @IsBoolean()
  hasDamage: boolean;

  @IsOptional()
  @IsEnum(DamageSource)
  damageSource?: DamageSource;

  @IsOptional()
  @IsEnum(DamageOperation)
  damageOperation?: DamageOperation;

  @IsOptional()
  @IsEnum(DamageAffects)
  damageAffects?: DamageAffects;

  @IsOptional()
  @IsEnum(DamageMoment)
  damageMoment?: DamageMoment;

  @IsOptional()
  @IsString()
  damageMomentOther?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  descriptions?: string[];
}

export class FinishTarjaDto {
  @IsOptional()
  @IsString()
  details?: string;

  @IsOptional()
  @IsString()
  initials?: string;
}

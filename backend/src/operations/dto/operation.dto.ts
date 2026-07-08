import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { OperationType } from '@prisma/client';

export class CreateOperationDto {
  @IsString()
  @MinLength(1)
  code: string;

  @IsString()
  @MinLength(1)
  shipName: string;

  @IsEnum(OperationType)
  operationType: OperationType;

  @IsOptional()
  @IsDateString()
  operationDate?: string;

  @IsOptional()
  @IsString()
  portDischarge?: string;
}

export class UpdateOperationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  shipName?: string;

  @IsOptional()
  @IsEnum(OperationType)
  operationType?: OperationType;

  @IsOptional()
  @IsDateString()
  operationDate?: string;

  @IsOptional()
  @IsString()
  portDischarge?: string;
}

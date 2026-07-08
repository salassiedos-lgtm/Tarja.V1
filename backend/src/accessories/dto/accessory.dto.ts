import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAccessoryDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateAccessoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

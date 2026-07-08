import { IsOptional, IsString, MinLength } from 'class-validator';

export class AnnulDto {
  @IsString()
  @MinLength(3)
  reason: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

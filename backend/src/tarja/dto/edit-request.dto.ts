import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class EditRequestDto {
  @IsString()
  @MinLength(3)
  reason: string;
}

export class ResolveEditRequestDto {
  @IsBoolean()
  approve: boolean;

  @IsOptional()
  @IsString()
  comment?: string;
}

import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { RoleName } from '@prisma/client';

const ROLES: RoleName[] = ['ADMIN', 'SUPERVISOR', 'TARJADOR'];

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  lastname: string;

  @IsString()
  @MinLength(3)
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsIn(ROLES)
  role: RoleName;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastname?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: RoleName;
}

export class SetStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status: 'ACTIVE' | 'INACTIVE';
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  password: string;
}

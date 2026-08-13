import { IsEmail, IsEnum, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';

export class LoginDto {
  @ApiPropertyOptional({ example: 'abc.f.stu001', description: 'Generated parent username or staff email' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ example: 'admin@abcschool.com' })
  @ValidateIf((dto: LoginDto) => !dto.username)
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiPropertyOptional({ enum: RoleName, description: 'Restrict login to a specific role context' })
  @IsOptional()
  @IsEnum(RoleName)
  expectedRole?: RoleName;
}

import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class CreateInviteDto {
  @ApiPropertyOptional({ enum: Role, description: 'Role granted on redemption. Admin roles are rejected.' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ description: 'Department to place the new member in (must belong to the org).' })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Organisation id. Only SUPER_ADMIN may target an org other than their own.' })
  @IsOptional()
  @IsString()
  orgId?: string;

  @ApiPropertyOptional({ example: 'For Dr. Sharma (CSE)', description: 'Admin note — who this invite is for.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  note?: string;

  @ApiPropertyOptional({ example: 48, description: 'Validity window in hours (1–336). Default 48.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(336)
  ttlHours?: number;
}

export class ValidateInviteDto {
  @ApiProperty({ example: 'ABCD-EFGH-JKLM-NPQR' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;
}

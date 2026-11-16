import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Passwords: min 8, must contain letter + number. (Clear, enforced server-side.)
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export class RegisterDto {
  @ApiProperty({ example: 'ABCD-EFGH-JKLM-NPQR', description: 'Single-use invite code from an admin (scanned QR or typed)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  inviteToken!: string;

  @ApiProperty({ example: 'faculty@iitd.ac.in' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Dr. A. Sharma' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ example: 'Passw0rd!', description: 'Min 8 chars, at least one letter and one number' })
  @Matches(PASSWORD_REGEX, { message: 'Password must be at least 8 characters and include a letter and a number' })
  password!: string;

  @ApiPropertyOptional({ example: '+91XXXXXXXXXX' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: 'faculty@iitd.ac.in' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class ResendOtpDto {
  @ApiProperty({ example: 'faculty@iitd.ac.in' })
  @IsEmail()
  email!: string;
}

export class OrgVerificationDto {
  @ApiProperty({ description: 'Organization id the user belongs to' })
  @IsString()
  @IsNotEmpty()
  orgId!: string;

  @ApiPropertyOptional({ description: 'Department id (if applicable)' })
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiProperty({ example: 'Assistant Professor' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  designation!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'faculty@iitd.ac.in' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Passw0rd!' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({ example: 'Pixel 8 / Android 15' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceInfo?: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'faculty@iitd.ac.in' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'faculty@iitd.ac.in' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'ABCD-EFGH-JKLM-NPQR', description: 'One-time reset code issued by an admin' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;

  @ApiProperty({ example: 'NewPassw0rd!' })
  @Matches(PASSWORD_REGEX, { message: 'Password must be at least 8 characters and include a letter and a number' })
  newPassword!: string;
}

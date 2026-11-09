import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Confidentiality, InvitationRole } from '@prisma/client';

export class InviteeDto {
  @ApiPropertyOptional({ description: 'Existing user id to invite' })
  @IsOptional() @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Email to invite as a guest (if not an existing user)' })
  @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: InvitationRole, default: InvitationRole.PARTICIPANT })
  @IsOptional() @IsEnum(InvitationRole)
  role?: InvitationRole;
}

export class MeetingPoliciesDto {
  @IsOptional() @IsBoolean() allowRecording?: boolean;
  @IsOptional() @IsBoolean() allowScreenShare?: boolean;
  @IsOptional() @IsBoolean() allowChat?: boolean;
  @IsOptional() @IsBoolean() micOnJoin?: boolean;
  @IsOptional() @IsBoolean() cameraOnJoin?: boolean;
}

export class CreateMeetingDto {
  @ApiProperty({ example: 'AICTE Approval Committee Review' })
  @IsString() @IsNotEmpty() @MaxLength(160)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(4000)
  agenda?: string;

  @ApiProperty({ example: '2026-12-01T10:00:00.000Z' })
  @IsDateString()
  startAt!: string;

  @ApiProperty({ example: '2026-12-01T11:00:00.000Z' })
  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional({ default: 'Asia/Kolkata' })
  @IsOptional() @IsString() @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ default: 'STANDARD' })
  @IsOptional() @IsString() @MaxLength(40)
  type?: string;

  @ApiPropertyOptional({ enum: Confidentiality, default: Confidentiality.INTERNAL })
  @IsOptional() @IsEnum(Confidentiality)
  confidentiality?: Confidentiality;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  waitingRoomEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Optional passcode (hashed server-side)' })
  @IsOptional() @IsString() @MaxLength(40)
  passcode?: string;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional() @IsInt() @Min(2) @Max(500)
  capacity?: number;

  @ApiPropertyOptional({ type: MeetingPoliciesDto })
  @IsOptional() @ValidateNested() @Type(() => MeetingPoliciesDto)
  policies?: MeetingPoliciesDto;

  @ApiPropertyOptional({ type: [InviteeDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => InviteeDto)
  invitees?: InviteeDto[];
}

export class UpdateMeetingDto {
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(4000) agenda?: string;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsEnum(Confidentiality) confidentiality?: Confidentiality;
  @IsOptional() @IsBoolean() waitingRoomEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(40) passcode?: string;
  @IsOptional() @IsInt() @Min(2) @Max(500) capacity?: number;
  @IsOptional() @ValidateNested() @Type(() => MeetingPoliciesDto) policies?: MeetingPoliciesDto;
}

export class InviteBodyDto {
  @ApiProperty({ type: [InviteeDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => InviteeDto)
  invitees!: InviteeDto[];
}

export type MeetingScope = 'upcoming' | 'ongoing' | 'past' | 'invitations' | 'mine' | 'all';

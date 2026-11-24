import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { InviteStatus, OtpPurpose, Prisma, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { TokensService } from './tokens.service';
import { PasswordResetService } from '../password-reset/password-reset.service';
import { generateOtp, normalizeInviteCode, sha256Hex } from '../common/crypto/hash.util';
import {
  ForgotPasswordDto,
  LoginDto,
  OrgVerificationDto,
  RegisterDto,
  RequestAccessDto,
  ResetPasswordDto,
  VerifyOtpDto,
} from './dto/auth.dto';

interface LockState {
  fails: number;
  lockedUntil: number | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // In-memory login lockout (single API instance; documented in STUDENT.md).
  private readonly locks = new Map<string, LockState>();
  // Track last OTP send per email to enforce resend cooldown.
  private readonly lastOtpSent = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly tokens: TokensService,
    private readonly config: ConfigService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  // ---------------- Registration + OTP ----------------

  /**
   * A prospective member (no account yet) asks for an invitation code. We notify every
   * administrator in-app so they can issue a code from the Invites screen if the person is
   * allowed in. Response is uniform regardless of outcome (no account enumeration).
   */
  async requestAccess(dto: RequestAccessDto): Promise<{ message: string }> {
    const email = dto.email.toLowerCase().trim();
    const fullName = dto.fullName.trim();
    const admins = await this.prisma.user.findMany({
      where: { role: { in: [Role.SUPER_ADMIN, Role.INSTITUTE_ADMIN] }, status: UserStatus.APPROVED },
      select: { id: true },
    });
    if (admins.length > 0) {
      const body = `${fullName} (${email}) is requesting an invitation code.${dto.note ? ` Note: ${dto.note.trim()}` : ''}`;
      await this.prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: 'ACCESS_REQUEST',
          title: 'Access request',
          body,
          data: { email, fullName, note: dto.note ?? null } as object,
        })),
      });
    }
    await this.audit.log({ actorId: 'anonymous', action: 'ACCESS_REQUESTED', targetType: 'User', targetId: email });
    return { message: 'Your request has been sent to the administrators. You will receive a code if approved.' };
  }

  /**
   * Admin-controlled, QR-based registration. There is NO email or OTP here.
   * A valid, unused, unexpired admin invite is required; redeeming it:
   *   - is ATOMIC and single-use (an ACTIVE→REDEEMED conditional update inside a
   *     transaction — two people cannot claim the same code), and
   *   - grants the role / org / department the admin baked into the invite, so the
   *     account is created already APPROVED and the member can use the app at once.
   * We return a session immediately (auto-login) so scan → register → in.
   */
  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const code = normalizeInviteCode(dto.inviteToken);
    if (code.length < 8) throw new BadRequestException('A valid invitation code is required.');
    const tokenHash = sha256Hex(code);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    let user;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        // Atomic claim: succeeds for exactly one caller, and only while the invite is
        // ACTIVE and unexpired. count === 0 means invalid / expired / already used / revoked.
        const claim = await tx.invite.updateMany({
          where: { tokenHash, status: InviteStatus.ACTIVE, expiresAt: { gt: new Date() } },
          data: { status: InviteStatus.REDEEMED, redeemedAt: new Date() },
        });
        if (claim.count === 0) {
          throw new BadRequestException('This invitation is invalid, expired, or already used.');
        }
        const invite = await tx.invite.findUnique({ where: { tokenHash } });
        const created = await tx.user.create({
          data: {
            email,
            fullName: dto.fullName.trim(),
            phone: dto.phone,
            passwordHash,
            role: invite!.role, // the admin chose this when generating the invite
            status: UserStatus.APPROVED, // pre-authorised by the admin — no approval queue
            emailVerified: true, // email is just an identifier here; nothing is sent
            orgId: invite!.orgId ?? null,
            departmentId: invite!.departmentId ?? null,
          },
        });
        await tx.invite.update({ where: { tokenHash }, data: { redeemedByUserId: created.id } });
        // Explicit consent trail at sign-up (privacy requirement).
        await tx.consentRecord.create({ data: { userId: created.id, type: 'TERMS_PRIVACY', version: '1.0' } });
        return created;
      });
    } catch (err) {
      // Lost an email-uniqueness race inside the transaction → report as a clean 409.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw err;
    }

    await this.audit.log({
      actorId: user.id,
      action: 'AUTH_REGISTER',
      targetType: 'User',
      targetId: user.id,
      orgId: user.orgId,
      metadata: { email, via: 'INVITE' },
    });

    // Account is active → sign the member in right away.
    const pair = await this.tokens.issuePair(user);
    return {
      message: 'Account created. You are signed in.',
      status: user.status,
      ...pair,
      user: this.publicUser(user),
    };
  }

  private async issueOtp(userId: string, email: string, purpose: OtpPurpose): Promise<void> {
    const cooldown = this.config.get<number>('throttle.otpResendCooldown') ?? 60;
    const key = `${email}:${purpose}`;
    const last = this.lastOtpSent.get(key);
    if (last && Date.now() - last < cooldown * 1000) {
      throw new BadRequestException(`Please wait before requesting another code`);
    }

    const code = generateOtp(6);
    const codeHash = await argon2.hash(code, { type: argon2.argon2id });
    const ttl = this.config.get<number>('throttle.otpTtlSeconds') ?? 600;

    // Invalidate all prior OTPs of this purpose (keep exactly one active code).
    await this.prisma.otp.deleteMany({ where: { userId, purpose } });
    await this.prisma.otp.create({
      data: { userId, codeHash, purpose, expiresAt: new Date(Date.now() + ttl * 1000) },
    });
    this.lastOtpSent.set(key, Date.now());
    await this.mail.sendOtp(email, code, purpose);
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('User not found');

    const otp = await this.prisma.otp.findFirst({
      where: { userId: user.id, purpose: OtpPurpose.EMAIL_VERIFY },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.consumedAt) throw new BadRequestException('No active code. Please request a new one.');
    await this.assertOtpUsable(otp.id, otp.attempts, otp.expiresAt);

    const ok = await argon2.verify(otp.codeHash, dto.code);
    if (!ok) {
      await this.prisma.otp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('Incorrect code');
    }

    await this.prisma.otp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, status: UserStatus.PENDING_APPROVAL },
    });
    await this.audit.log({ actorId: user.id, action: 'AUTH_EMAIL_VERIFIED', targetType: 'User', targetId: user.id });
    // Issue a session now so the user can complete org verification and track their
    // approval status. The token carries status=PENDING_APPROVAL; real features stay
    // role-gated (the user is still a GUEST), so this grants no privileged access.
    const pair = await this.tokens.issuePair(updated);
    return {
      message: 'Email verified. Complete organization verification, then await approval.',
      status: updated.status,
      ...pair,
      user: this.publicUser(updated),
    };
  }

  private async assertOtpUsable(otpId: string, attempts: number, expiresAt: Date): Promise<void> {
    const maxAttempts = this.config.get<number>('throttle.otpMaxAttempts') ?? 5;
    if (expiresAt.getTime() < Date.now()) {
      await this.prisma.otp.delete({ where: { id: otpId } }).catch(() => undefined);
      throw new BadRequestException('Code expired. Please request a new one.');
    }
    if (attempts >= maxAttempts) {
      throw new BadRequestException('Too many incorrect attempts. Please request a new code.');
    }
  }

  async resendOtp(email: string) {
    const normalized = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    // Do not reveal whether the account exists.
    if (user && user.status === UserStatus.PENDING_OTP) {
      await this.issueOtp(user.id, normalized, OtpPurpose.EMAIL_VERIFY);
    }
    return { message: 'If an account is pending verification, a new code has been sent.' };
  }

  // ---------------- Organization verification ----------------

  async submitOrgVerification(userId: string, dto: OrgVerificationDto) {
    const org = await this.prisma.organization.findUnique({ where: { id: dto.orgId } });
    if (!org) throw new BadRequestException('Unknown organization');
    if (dto.departmentId) {
      const dept = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!dept || dept.orgId !== dto.orgId) throw new BadRequestException('Invalid department for organization');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { orgId: dto.orgId, departmentId: dto.departmentId ?? null, designation: dto.designation.trim() },
    });
    await this.audit.log({ actorId: userId, action: 'AUTH_ORG_SUBMITTED', targetType: 'User', targetId: userId, orgId: dto.orgId });
    return { message: 'Organization details submitted. Awaiting approval.', status: user.status };
  }

  // ---------------- Login / refresh / logout ----------------

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();
    this.assertNotLocked(email);

    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = user ? await argon2.verify(user.passwordHash, dto.password).catch(() => false) : false;

    if (!user || !valid) {
      this.registerFailure(email);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Status gating with clear, honest messages.
    // Email must be verified; SUSPENDED is blocked outright. PENDING_APPROVAL and REJECTED
    // users CAN sign in — only to see their application status; they get no features
    // (still GUEST role, so every protected route 403s) until approved.
    if (user.status === UserStatus.PENDING_OTP) throw new ForbiddenException('Email not verified. Please verify the OTP sent to your email.');
    if (user.status === UserStatus.SUSPENDED) throw new ForbiddenException('Your account is suspended.');

    this.clearFailures(email);
    const pair = await this.tokens.issuePair(user, dto.deviceInfo);
    await this.audit.log({ actorId: user.id, action: 'AUTH_LOGIN', targetType: 'User', targetId: user.id, orgId: user.orgId });
    return { ...pair, user: this.publicUser(user) };
  }

  async refresh(refreshToken: string) {
    return this.tokens.rotate(refreshToken);
  }

  async logout(familyId: string, userId: string) {
    await this.tokens.revokeFamily(familyId);
    await this.audit.log({ actorId: userId, action: 'AUTH_LOGOUT', targetType: 'Session', targetId: familyId });
    return { message: 'Logged out' };
  }

  // ---------------- Password reset (admin-controlled; no email/SMTP) ----------------
  // A member requests a reset; an admin approves it from their dashboard, which issues a
  // short-lived one-time code; the member uses it to set a new password. See
  // PasswordResetService for the full flow.

  async forgotPassword(dto: ForgotPasswordDto) {
    return this.passwordReset.requestReset(dto.email);
  }

  async resetPassword(dto: ResetPasswordDto) {
    return this.passwordReset.completeReset(dto.email, dto.code, dto.newPassword);
  }

  // ---------------- Lockout helpers ----------------

  private assertNotLocked(email: string): void {
    const state = this.locks.get(email);
    if (state?.lockedUntil && state.lockedUntil > Date.now()) {
      const mins = Math.ceil((state.lockedUntil - Date.now()) / 60000);
      throw new ForbiddenException(`Too many failed attempts. Try again in ~${mins} minute(s).`);
    }
  }

  private registerFailure(email: string): void {
    const max = this.config.get<number>('throttle.loginMaxAttempts') ?? 5;
    const lockMins = this.config.get<number>('throttle.loginLockMinutes') ?? 15;
    const state = this.locks.get(email) ?? { fails: 0, lockedUntil: null };
    state.fails += 1;
    if (state.fails >= max) {
      state.lockedUntil = Date.now() + lockMins * 60000;
      state.fails = 0;
    }
    this.locks.set(email, state);
  }

  private clearFailures(email: string): void {
    this.locks.delete(email);
  }

  private publicUser(u: { id: string; email: string; fullName: string; role: string; status: string; orgId: string | null; designation: string | null }) {
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      status: u.status,
      orgId: u.orgId,
      designation: u.designation,
    };
  }
}

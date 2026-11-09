import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export type OtpPurpose = 'EMAIL_VERIFY' | 'PASSWORD_RESET';

/**
 * Email delivery with an honest configuration check.
 *
 * - SMTP configured  -> send real email via nodemailer.
 * - SMTP NOT configured + NODE_ENV=development -> log the OTP to the backend console
 *   (DEVELOPMENT-ONLY fallback, so the flow is fully testable without SMTP).
 * - SMTP NOT configured + production -> loud startup warning; send attempts throw so we
 *   NEVER silently pretend an email was sent.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private get smtpHost(): string {
    return this.config.get<string>('smtp.host') ?? '';
  }

  private get isProd(): boolean {
    return this.config.get<boolean>('isProd') ?? false;
  }

  /** True only when a real SMTP host is configured. */
  get isConfigured(): boolean {
    return this.smtpHost.trim().length > 0;
  }

  onModuleInit(): void {
    if (this.isConfigured) {
      this.transporter = nodemailer.createTransport({
        host: this.smtpHost,
        port: this.config.get<number>('smtp.port'),
        secure: this.config.get<boolean>('smtp.secure'),
        auth: {
          user: this.config.get<string>('smtp.user'),
          pass: this.config.get<string>('smtp.pass'),
        },
      });
      this.logger.log(`SMTP configured (host=${this.smtpHost}). Emails will be sent.`);
      return;
    }

    if (this.isProd) {
      this.logger.error(
        'SMTP is NOT configured but NODE_ENV=production. Email OTP delivery will FAIL. ' +
          'Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS. The console fallback is disabled in production.',
      );
    } else {
      this.logger.warn(
        'SMTP is NOT configured (SMTP_HOST empty). DEVELOPMENT-ONLY fallback active: ' +
          'OTP codes will be printed to this console instead of emailed. Do not use this in production.',
      );
    }
  }

  async sendOtp(to: string, code: string, purpose: OtpPurpose): Promise<void> {
    const subject =
      purpose === 'EMAIL_VERIFY'
        ? 'Your AICTE Vimarsh verification code'
        : 'Your AICTE Vimarsh password reset code';
    const text =
      `AICTE Vimarsh\n\nYour ${purpose === 'EMAIL_VERIFY' ? 'email verification' : 'password reset'} code is: ${code}\n` +
      `It expires shortly. If you did not request this, ignore this email.`;

    if (this.isConfigured && this.transporter) {
      await this.transporter.sendMail({
        from: this.config.get<string>('smtp.from'),
        to,
        subject,
        text,
      });
      this.logger.log(`OTP email sent to ${to} (${purpose})`);
      return;
    }

    // Not configured.
    if (this.isProd) {
      // Never silently fake it.
      throw new Error('Email provider not configured; cannot send OTP in production.');
    }

    // Development-only console fallback.
    this.logger.warn(
      `\n==================== DEV OTP (no SMTP) ====================\n` +
        `  To:      ${to}\n` +
        `  Purpose: ${purpose}\n` +
        `  CODE:    ${code}\n` +
        `==========================================================\n`,
    );
  }
}

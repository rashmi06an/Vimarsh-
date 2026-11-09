/**
 * Centralised, typed configuration loaded from environment variables.
 * No secret is ever hardcoded — everything comes from process.env (.env in dev).
 */
export interface AppConfig {
  nodeEnv: string;
  isProd: boolean;
  port: number;
  databaseUrl: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: number;
    refreshTtl: number;
  };
  throttle: {
    loginMaxAttempts: number;
    loginLockMinutes: number;
    otpTtlSeconds: number;
    otpMaxAttempts: number;
    otpResendCooldown: number;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
  };
  livekit: {
    url: string;
    apiKey: string;
    apiSecret: string;
  };
  s3: {
    endpoint: string;
    region: string;
    accessKey: string;
    secretKey: string;
    bucket: string;
    forcePathStyle: boolean;
    signedUrlTtl: number;
  };
  providers: {
    sms: string;
    push: string;
    malwareScanner: string;
  };
  maxUploadBytes: number;
  corsOrigins: string;
  livekitEgressS3Endpoint: string;
  /** 32-byte key (hex or base64) for AES-256-GCM encryption at rest of uploaded documents. */
  documentEncryptionKey: string;
}

const num = (v: string | undefined, def: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== '' ? n : def;
};

const bool = (v: string | undefined, def = false): boolean =>
  v === undefined || v === '' ? def : v.toLowerCase() === 'true';

export default (): AppConfig => {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  return {
    nodeEnv,
    isProd: nodeEnv === 'production',
    port: num(process.env.PORT, 4000),
    databaseUrl: process.env.DATABASE_URL ?? '',
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
      refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
      accessTtl: num(process.env.ACCESS_TTL, 900),
      refreshTtl: num(process.env.REFRESH_TTL, 1209600),
    },
    throttle: {
      loginMaxAttempts: num(process.env.LOGIN_MAX_ATTEMPTS, 5),
      loginLockMinutes: num(process.env.LOGIN_LOCK_MINUTES, 15),
      otpTtlSeconds: num(process.env.OTP_TTL_SECONDS, 600),
      otpMaxAttempts: num(process.env.OTP_MAX_ATTEMPTS, 5),
      otpResendCooldown: num(process.env.OTP_RESEND_COOLDOWN, 60),
    },
    smtp: {
      host: process.env.SMTP_HOST ?? '',
      port: num(process.env.SMTP_PORT, 587),
      secure: bool(process.env.SMTP_SECURE, false),
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
      from: process.env.MAIL_FROM ?? 'AICTE Vimarsh <no-reply@vimarsh.local>',
    },
    livekit: {
      url: process.env.LIVEKIT_URL ?? '',
      apiKey: process.env.LIVEKIT_API_KEY ?? '',
      apiSecret: process.env.LIVEKIT_API_SECRET ?? '',
    },
    s3: {
      endpoint: process.env.S3_ENDPOINT ?? '',
      region: process.env.S3_REGION ?? 'us-east-1',
      accessKey: process.env.S3_ACCESS_KEY ?? '',
      secretKey: process.env.S3_SECRET_KEY ?? '',
      bucket: process.env.S3_BUCKET ?? 'vimarsh-private',
      forcePathStyle: bool(process.env.S3_FORCE_PATH_STYLE, true),
      signedUrlTtl: num(process.env.SIGNED_URL_TTL, 300),
    },
    providers: {
      sms: process.env.SMS_PROVIDER ?? '',
      push: process.env.PUSH_PROVIDER ?? '',
      malwareScanner: process.env.MALWARE_SCANNER ?? '',
    },
    maxUploadBytes: num(process.env.MAX_UPLOAD_MB, 25) * 1024 * 1024,
    corsOrigins: process.env.CORS_ORIGINS ?? '*',
    // Egress runs inside Docker; it reaches MinIO on the compose network, not localhost.
    livekitEgressS3Endpoint: process.env.LIVEKIT_EGRESS_S3_ENDPOINT ?? 'http://minio:9000',
    documentEncryptionKey: process.env.DOCUMENT_ENCRYPTION_KEY ?? '',
  };
};

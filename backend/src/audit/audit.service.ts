import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalJson, sha256Hex } from '../common/crypto/hash.util';

const GENESIS_HASH = '0'.repeat(64);

export interface AuditInput {
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  orgId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ChainVerification {
  valid: boolean;
  count: number;
  brokenAtSeq: number | null;
  reason: string | null;
}

/**
 * Append-only, hash-chained audit log.
 *
 * Each record's hash = SHA-256 over the canonical fields
 *   { seq, actorId, action, targetType, targetId, metadata, prevHash, createdAt }.
 * prevHash links to the previous record's hash (genesis = 64 zeros).
 * Changing any past record (or reordering) breaks the chain, which /audit/verify detects.
 *
 * Writes are serialised through an in-process promise queue so seq and prevHash are
 * assigned without races on this single API instance. (Documented in STUDENT.md; for a
 * multi-instance deployment this would move to a DB sequence or a dedicated writer.)
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly prisma: PrismaService) {}

  /** Append an entry. Never throws into the caller's main flow — logging failures are logged. */
  async log(input: AuditInput): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => this.append(input)).catch((err) => {
      this.logger.error(`Failed to write audit entry (${input.action}): ${err?.message}`);
    });
    await this.writeQueue;
  }

  private async append(input: AuditInput): Promise<void> {
    const last = await this.prisma.auditLog.findFirst({ orderBy: { seq: 'desc' } });
    const seq = (last?.seq ?? 0) + 1;
    const prevHash = last?.hash ?? GENESIS_HASH;
    const createdAt = new Date();

    const canonical = {
      seq,
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: input.metadata ?? null,
      prevHash,
      createdAt: createdAt.toISOString(),
    };
    const hash = sha256Hex(canonicalJson(canonical));

    await this.prisma.auditLog.create({
      data: {
        seq,
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        orgId: input.orgId ?? null,
        metadata: (input.metadata ?? undefined) as object | undefined,
        prevHash,
        hash,
        createdAt,
      },
    });
  }

  /** Recompute the whole chain and confirm every link and hash is intact. */
  async verifyChain(): Promise<ChainVerification> {
    const logs = await this.prisma.auditLog.findMany({ orderBy: { seq: 'asc' } });
    let prevHash = GENESIS_HASH;

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const expectedSeq = i + 1;
      if (log.seq !== expectedSeq) {
        return { valid: false, count: logs.length, brokenAtSeq: log.seq, reason: `Sequence gap: expected ${expectedSeq}, got ${log.seq}` };
      }
      if (log.prevHash !== prevHash) {
        return { valid: false, count: logs.length, brokenAtSeq: log.seq, reason: `prevHash mismatch at seq ${log.seq}` };
      }
      const canonical = {
        seq: log.seq,
        actorId: log.actorId,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        metadata: log.metadata ?? null,
        prevHash: log.prevHash,
        createdAt: log.createdAt.toISOString(),
      };
      const recomputed = sha256Hex(canonicalJson(canonical));
      if (recomputed !== log.hash) {
        return { valid: false, count: logs.length, brokenAtSeq: log.seq, reason: `Hash mismatch at seq ${log.seq} (record was tampered)` };
      }
      prevHash = log.hash;
    }
    return { valid: true, count: logs.length, brokenAtSeq: null, reason: null };
  }

  async list(limit = 100, orgId?: string | null) {
    return this.prisma.auditLog.findMany({
      where: orgId ? { orgId } : undefined,
      orderBy: { seq: 'desc' },
      take: Math.min(limit, 500),
    });
  }
}

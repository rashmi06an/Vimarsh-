import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { MeetingsService } from '../meetings/meetings.service';
import { sha256Hex } from '../common/crypto/hash.util';
import { encryptBuffer, decryptBuffer, parseEncryptionKey, ENC_ALGO } from '../common/crypto/file-crypto';
import { AuthedUser } from '../common/interfaces/jwt-payload.interface';
import { validateFile, ALLOWED_EXTS, UploadedFileLike } from './file-validation';

@Injectable()
export class DocumentsService {
  private encKey: Buffer | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly meetings: MeetingsService,
    private readonly config: ConfigService,
  ) {}

  /** Lazily parse + cache the 32-byte at-rest encryption key from env. Fails loudly if misconfigured. */
  private key(): Buffer {
    if (!this.encKey) this.encKey = parseEncryptionKey(this.config.get<string>('documentEncryptionKey'));
    return this.encKey;
  }

  private async loadMeetingWithView(actor: AuthedUser, meetingId: string) {
    const meeting = await this.prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    // Access to documents ends when meeting access ends (same rule as viewing the meeting).
    await this.meetings.assertCanView(actor, meeting);
    return meeting;
  }

  async upload(actor: AuthedUser, meetingId: string, file: UploadedFileLike) {
    const meeting = await this.loadMeetingWithView(actor, meetingId);
    if (!file) throw new BadRequestException('No file provided');

    const maxBytes = this.config.get<number>('maxUploadBytes') ?? 25 * 1024 * 1024;
    if (file.size > maxBytes) throw new BadRequestException(`File exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit`);

    // Validate by content, not by client MIME/name.
    const detected = validateFile(file.originalname, file.buffer);
    if (!detected) {
      throw new BadRequestException(`Unsupported or mismatched file. Allowed: ${ALLOWED_EXTS.join(', ')}`);
    }

    const scanner = this.config.get<string>('providers.malwareScanner') ?? '';
    const scanStatus = scanner ? 'PENDING' : 'SKIPPED'; // honest: no scanner configured -> SKIPPED

    // Integrity hash is over the ORIGINAL plaintext (what the user uploaded).
    const sha256 = sha256Hex(file.buffer.toString('binary'));

    // Encrypt at rest: the object written to MinIO is AES-256-GCM ciphertext, never plaintext.
    const { ciphertext, iv, authTag } = encryptBuffer(file.buffer, this.key());
    const storageKey = `meetings/${meetingId}/${randomUUID()}.${detected.ext}.enc`;
    // Store as opaque bytes; the real content type lives in the DB and is applied on download.
    await this.storage.putObject(storageKey, ciphertext, 'application/octet-stream');

    const doc = await this.prisma.document.create({
      data: {
        meetingId,
        uploaderId: actor.id,
        fileName: file.originalname,
        storageKey,
        contentType: detected.mime,
        sizeBytes: file.size,
        sha256,
        scanStatus: scanStatus as 'SKIPPED' | 'PENDING',
        encAlgo: ENC_ALGO,
        encIv: iv.toString('base64'),
        encTag: authTag.toString('base64'),
      },
    });
    await this.audit.log({ actorId: actor.id, action: 'DOCUMENT_UPLOADED', targetType: 'Document', targetId: doc.id, orgId: meeting.orgId, metadata: { fileName: file.originalname, sizeBytes: file.size } });

    return this.publicDoc(doc);
  }

  async list(actor: AuthedUser, meetingId: string) {
    await this.loadMeetingWithView(actor, meetingId);
    const docs = await this.prisma.document.findMany({ where: { meetingId }, orderBy: { createdAt: 'desc' } });
    return docs.map((d) => this.publicDoc(d));
  }

  /**
   * Authorized download. Because documents are encrypted at rest, the client cannot be handed
   * a presigned URL to the raw object (that would be ciphertext). Instead the backend fetches
   * the ciphertext, decrypts it IN MEMORY only after the access check passes, and returns the
   * original bytes for the controller to stream. Decryption therefore happens only after
   * authorization, and the plaintext never lands back in storage.
   */
  async download(actor: AuthedUser, documentId: string): Promise<{ fileName: string; contentType: string; data: Buffer }> {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found');
    const meeting = await this.prisma.meeting.findUnique({ where: { id: doc.meetingId } });
    if (!meeting) throw new NotFoundException('Meeting not found');
    await this.meetings.assertCanView(actor, meeting);
    if (doc.scanStatus === 'INFECTED') throw new ForbiddenException('This file was flagged by malware scanning');

    const ciphertext = await this.storage.getObject(doc.storageKey);
    let data: Buffer;
    if (doc.encAlgo && doc.encIv && doc.encTag) {
      data = decryptBuffer(ciphertext, this.key(), Buffer.from(doc.encIv, 'base64'), Buffer.from(doc.encTag, 'base64'));
    } else {
      // Legacy/plaintext object (pre-encryption). None exist in this build, but stay robust.
      data = ciphertext;
    }

    await this.audit.log({ actorId: actor.id, action: 'DOCUMENT_DOWNLOADED', targetType: 'Document', targetId: doc.id, orgId: meeting.orgId });
    return { fileName: doc.fileName, contentType: doc.contentType, data };
  }

  private publicDoc(d: { id: string; fileName: string; contentType: string; sizeBytes: number; sha256: string; scanStatus: string; uploaderId: string; createdAt: Date }) {
    return {
      id: d.id,
      fileName: d.fileName,
      contentType: d.contentType,
      sizeBytes: d.sizeBytes,
      sha256: d.sha256,
      scanStatus: d.scanStatus,
      uploaderId: d.uploaderId,
      createdAt: d.createdAt,
    };
  }
}

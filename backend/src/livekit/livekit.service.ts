import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomServiceClient,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
} from 'livekit-server-sdk';

/**
 * Thin wrapper over the LiveKit server SDK. The API key/secret live ONLY here (backend);
 * the mobile app never sees them. Tokens are short-lived and scoped to a single room.
 */
@Injectable()
export class LivekitService {
  private readonly logger = new Logger(LivekitService.name);
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly wsUrl: string;
  private readonly httpUrl: string;
  private readonly roomClient: RoomServiceClient;
  private readonly egressClient: EgressClient;

  constructor(private readonly config: ConfigService) {
    const lk = this.config.get('livekit') as { url: string; apiKey: string; apiSecret: string };
    this.apiKey = lk.apiKey;
    this.apiSecret = lk.apiSecret;
    this.wsUrl = lk.url;
    // RoomServiceClient needs the HTTP(S) endpoint, not ws(s).
    this.httpUrl = lk.url.replace(/^ws/, 'http');
    this.roomClient = new RoomServiceClient(this.httpUrl, this.apiKey, this.apiSecret);
    this.egressClient = new EgressClient(this.httpUrl, this.apiKey, this.apiSecret);
  }

  get clientUrl(): string {
    return this.wsUrl;
  }

  /** Mint a short-lived join token scoped to one room. */
  async createToken(params: {
    room: string;
    identity: string;
    name: string;
    canPublish: boolean;
    ttlSeconds?: number;
  }): Promise<string> {
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: params.identity,
      name: params.name,
      ttl: params.ttlSeconds ?? 60 * 60, // 1h max; meeting-scoped
    });
    at.addGrant({
      roomJoin: true,
      room: params.room,
      canPublish: params.canPublish,
      canSubscribe: true,
      canPublishData: true, // chat/raise-hand data channel
    });
    return at.toJwt();
  }

  async removeParticipant(room: string, identity: string): Promise<void> {
    try {
      await this.roomClient.removeParticipant(room, identity);
    } catch (e) {
      this.logger.warn(`removeParticipant(${room}, ${identity}) failed: ${(e as Error).message}`);
    }
  }

  async endRoom(room: string): Promise<void> {
    try {
      await this.roomClient.deleteRoom(room);
    } catch (e) {
      this.logger.warn(`deleteRoom(${room}) failed: ${(e as Error).message}`);
    }
  }

  /**
   * Start server-side room-composite recording via LiveKit Egress, uploading to MinIO/S3.
   * Requires the livekit-egress service to be running (see docker-compose). The S3 endpoint
   * used here must be reachable from the EGRESS container (defaults to the docker network host).
   * Returns the egressId and the storage key of the resulting file.
   */
  async startRecording(room: string): Promise<{ egressId: string; storageKey: string }> {
    const s3 = this.config.get('s3') as {
      endpoint: string; region: string; accessKey: string; secretKey: string; bucket: string; forcePathStyle: boolean;
    };
    const egressEndpoint = this.config.get<string>('livekitEgressS3Endpoint') || s3.endpoint;
    const storageKey = `recordings/${room}-${Date.now()}.mp4`;

    const output = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: storageKey,
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: s3.accessKey,
          secret: s3.secretKey,
          bucket: s3.bucket,
          region: s3.region,
          endpoint: egressEndpoint,
          forcePathStyle: s3.forcePathStyle,
        }),
      },
    });

    const info = await this.egressClient.startRoomCompositeEgress(room, { file: output });
    return { egressId: info.egressId, storageKey };
  }

  async stopRecording(egressId: string): Promise<void> {
    await this.egressClient.stopEgress(egressId);
  }
}

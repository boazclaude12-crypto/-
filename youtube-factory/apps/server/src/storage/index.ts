import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { AppConfig } from '../config/index.js';
import { AppError } from '../shared/errors.js';

/**
 * Object storage port. Keys follow the layout in spec §67:
 *
 *   channels/{channelId}/videos/{videoId}/{script|scenes|audio|visuals|renders|thumbnail}/…
 */
export interface StoredObject {
  key: string;
  bytes: number;
  checksum: string;
  contentType: string;
}

export interface Storage {
  readonly driver: 'local' | 's3';
  put(key: string, body: Buffer | Uint8Array | string, contentType: string): Promise<StoredObject>;
  putFile(key: string, filePath: string, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  /** A path on the local filesystem — S3 objects are materialised into `workDir` first. */
  localPath(key: string, workDir: string): Promise<string>;
  url(key: string): string;
}

export const StorageKeys = {
  channel: (channelId: string) => `channels/${channelId}`,
  video: (channelId: string, videoId: string) => `channels/${channelId}/videos/${videoId}`,
  script: (channelId: string, videoId: string) => `channels/${channelId}/videos/${videoId}/script`,
  scene: (channelId: string, videoId: string, index: number, ext: string) =>
    `channels/${channelId}/videos/${videoId}/scenes/scene-${String(index).padStart(3, '0')}.${ext}`,
  visual: (channelId: string, videoId: string, index: number, ext: string) =>
    `channels/${channelId}/videos/${videoId}/visuals/visual-${String(index).padStart(3, '0')}.${ext}`,
  audio: (channelId: string, videoId: string, index: number, ext: string) =>
    `channels/${channelId}/videos/${videoId}/audio/vo-${String(index).padStart(3, '0')}.${ext}`,
  music: (channelId: string, videoId: string, ext: string) =>
    `channels/${channelId}/videos/${videoId}/audio/music.${ext}`,
  captions: (channelId: string, videoId: string, ext: string) =>
    `channels/${channelId}/videos/${videoId}/captions.${ext}`,
  render: (channelId: string, videoId: string, ext = 'mp4') =>
    `channels/${channelId}/videos/${videoId}/renders/final.${ext}`,
  thumbnail: (channelId: string, videoId: string, variant: string, ext = 'jpg') =>
    `channels/${channelId}/videos/${videoId}/thumbnail/${variant}.${ext}`,
  library: (name: string) => `library/${name}`,
} as const;

function assertSafeKey(key: string): void {
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\0')) {
    throw new AppError('invalid_storage_key', `Unsafe storage key: ${key}`, { statusCode: 400 });
  }
}

function checksumOf(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Filesystem-backed storage — the default for development and for the offline test run. */
export class LocalStorage implements Storage {
  readonly driver = 'local' as const;
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
  }

  private pathFor(key: string): string {
    assertSafeKey(key);
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + sep) && full !== this.root) {
      throw new AppError('invalid_storage_key', 'Storage key escapes the storage root', { statusCode: 400 });
    }
    return full;
  }

  async put(key: string, body: Buffer | Uint8Array | string, contentType: string): Promise<StoredObject> {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body as Uint8Array | string);
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buf);
    return { key, bytes: buf.length, checksum: checksumOf(buf), contentType };
  }

  async putFile(key: string, filePath: string, contentType: string): Promise<StoredObject> {
    return this.put(key, await readFile(filePath), contentType);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.pathFor(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async localPath(key: string): Promise<string> {
    return this.pathFor(key);
  }

  url(key: string): string {
    return `file://${this.pathFor(key)}`;
  }
}

export interface S3Options {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
  publicBaseUrl?: string;
}

/** S3-compatible storage (AWS S3, MinIO, R2, Spaces…). */
export class S3Storage implements Storage {
  readonly driver = 's3' as const;
  private client: import('@aws-sdk/client-s3').S3Client | undefined;

  constructor(private readonly opts: S3Options) {}

  private async s3() {
    if (!this.client) {
      const { S3Client } = await import('@aws-sdk/client-s3');
      this.client = new S3Client({
        region: this.opts.region,
        endpoint: this.opts.endpoint,
        forcePathStyle: this.opts.forcePathStyle,
        credentials: { accessKeyId: this.opts.accessKey, secretAccessKey: this.opts.secretKey },
      });
    }
    return this.client;
  }

  async put(key: string, body: Buffer | Uint8Array | string, contentType: string): Promise<StoredObject> {
    assertSafeKey(key);
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body as Uint8Array | string);
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.s3();
    await client.send(
      new PutObjectCommand({ Bucket: this.opts.bucket, Key: key, Body: buf, ContentType: contentType }),
    );
    return { key, bytes: buf.length, checksum: checksumOf(buf), contentType };
  }

  async putFile(key: string, filePath: string, contentType: string): Promise<StoredObject> {
    const size = (await stat(filePath)).size;
    if (size <= 5 * 1024 * 1024) return this.put(key, await readFile(filePath), contentType);

    // Large renders stream rather than buffering the whole file in memory.
    const { Upload } = await import('@aws-sdk/lib-storage').catch(() => ({ Upload: null as never }));
    if (!Upload) return this.put(key, await readFile(filePath), contentType);
    const client = await this.s3();
    const upload = new Upload({
      client,
      params: {
        Bucket: this.opts.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentType: contentType,
      },
    });
    await upload.done();
    const buf = await readFile(filePath);
    return { key, bytes: size, checksum: checksumOf(buf), contentType };
  }

  async get(key: string): Promise<Buffer> {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.s3();
    const res = await client.send(new GetObjectCommand({ Bucket: this.opts.bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async exists(key: string): Promise<boolean> {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.s3();
    try {
      await client.send(new HeadObjectCommand({ Bucket: this.opts.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.s3();
    await client.send(new DeleteObjectCommand({ Bucket: this.opts.bucket, Key: key }));
  }

  async localPath(key: string, workDir: string): Promise<string> {
    const target = join(resolve(workDir), key.replace(/[^A-Za-z0-9._/-]/g, '_'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await this.get(key));
    return target;
  }

  url(key: string): string {
    if (this.opts.publicBaseUrl) return `${this.opts.publicBaseUrl.replace(/\/$/, '')}/${key}`;
    const base = this.opts.endpoint?.replace(/\/$/, '') ?? `https://s3.${this.opts.region}.amazonaws.com`;
    return this.opts.forcePathStyle ? `${base}/${this.opts.bucket}/${key}` : `${base}/${key}`;
  }
}

export function createStorage(config: AppConfig): Storage {
  if (config.storage.driver === 's3' && config.storage.s3) return new S3Storage(config.storage.s3);
  return new LocalStorage(config.storage.localDir);
}

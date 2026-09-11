import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';

/**
 * A minimal S3-compatible object server, enough to drive the real AWS SDK through the code
 * paths `S3Storage` uses: single PUT, GET, HEAD, DELETE, and the multipart upload that
 * `@aws-sdk/lib-storage` switches to for large files — which is the path a finished render
 * actually takes and the one most likely to break unnoticed.
 *
 * Signatures are accepted without verification: request signing is the SDK's job, not ours,
 * and this server exists to verify *our* request construction and response handling.
 */
export class FakeS3 {
  private server!: Server;
  private readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  private readonly uploads = new Map<string, Map<number, Buffer>>();
  /** Every request, so a test can assert which protocol the SDK actually used. */
  readonly requests: Array<{ method: string; path: string }> = [];

  async start(): Promise<string> {
    this.server = createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  get objectCount(): number {
    return this.objects.size;
  }

  usedMultipart(): boolean {
    return this.requests.some((r) => r.path.includes('uploadId='));
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url ?? '/', 'http://localhost');
      // Path-style addressing: /{bucket}/{key…}
      const [, , ...keyParts] = url.pathname.split('/');
      const key = keyParts.join('/');
      const method = req.method ?? 'GET';
      this.requests.push({ method, path: `${url.pathname}${url.search}` });

      const uploadId = url.searchParams.get('uploadId');
      const partNumber = url.searchParams.get('partNumber');

      // ── multipart ───────────────────────────────────────────────────────
      if (method === 'POST' && url.searchParams.has('uploads')) {
        const id = `upload-${this.uploads.size + 1}`;
        this.uploads.set(id, new Map());
        return this.xml(res, 200, `<InitiateMultipartUploadResult><Bucket>b</Bucket><Key>${escapeXml(key)}</Key><UploadId>${id}</UploadId></InitiateMultipartUploadResult>`);
      }
      if (method === 'PUT' && uploadId && partNumber) {
        this.uploads.get(uploadId)?.set(Number(partNumber), body);
        res.writeHead(200, { etag: `"${md5(body)}"` });
        return void res.end();
      }
      if (method === 'POST' && uploadId) {
        const parts = this.uploads.get(uploadId) ?? new Map<number, Buffer>();
        const assembled = Buffer.concat([...parts.keys()].sort((a, b) => a - b).map((n) => parts.get(n)!));
        this.objects.set(key, { body: assembled, contentType: 'application/octet-stream' });
        this.uploads.delete(uploadId);
        return this.xml(res, 200, `<CompleteMultipartUploadResult><Bucket>b</Bucket><Key>${escapeXml(key)}</Key><ETag>"${md5(assembled)}"</ETag></CompleteMultipartUploadResult>`);
      }
      if (method === 'DELETE' && uploadId) {
        this.uploads.delete(uploadId);
        res.writeHead(204);
        return void res.end();
      }

      // ── single object ───────────────────────────────────────────────────
      switch (method) {
        case 'PUT': {
          this.objects.set(key, { body, contentType: String(req.headers['content-type'] ?? 'application/octet-stream') });
          res.writeHead(200, { etag: `"${md5(body)}"` });
          return void res.end();
        }
        case 'GET': {
          const object = this.objects.get(key);
          if (!object) return this.notFound(res);
          res.writeHead(200, { 'content-type': object.contentType, 'content-length': String(object.body.length) });
          return void res.end(object.body);
        }
        case 'HEAD': {
          const object = this.objects.get(key);
          if (!object) {
            res.writeHead(404);
            return void res.end();
          }
          res.writeHead(200, { 'content-length': String(object.body.length) });
          return void res.end();
        }
        case 'DELETE': {
          this.objects.delete(key);
          res.writeHead(204);
          return void res.end();
        }
        default:
          return this.notFound(res);
      }
    });
  }

  private notFound(res: ServerResponse): void {
    this.xml(res, 404, '<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>');
  }

  private xml(res: ServerResponse, status: number, body: string): void {
    res.writeHead(status, { 'content-type': 'application/xml' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>${body}`);
  }
}

function md5(body: Buffer): string {
  return createHash('md5').update(body).digest('hex');
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

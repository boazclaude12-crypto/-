import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BullMqQueue, InMemoryQueue, type JobQueue } from '../queue/index.js';
import { LocalStorage, S3Storage, StorageKeys, type Storage } from '../storage/index.js';
import { systemClock } from '../shared/clock.js';
import { newId } from '../shared/ids.js';
import { FakeS3 } from './fake-s3.js';

/**
 * Production driver verification.
 *
 * The in-memory queue and local filesystem storage are exercised by every other test, which
 * proves the *ports* work. These tests exercise the drivers a real deployment actually runs:
 * BullMQ on Redis, and S3Storage against an S3-compatible server.
 *
 * Each block skips itself when its service is absent, so the suite still passes on a bare
 * machine. Point them at real services to run them:
 *
 *   TEST_REDIS_URL=redis://127.0.0.1:6379 npm test
 *
 * The S3 block always runs: it drives the real AWS SDK against an in-process S3-compatible
 * server, so the request construction and the multipart path are verified without needing a
 * MinIO container. Set TEST_S3_ENDPOINT to point it at a real one instead.
 */
const REDIS_URL = process.env.TEST_REDIS_URL;
const S3_ENDPOINT = process.env.TEST_S3_ENDPOINT;

// ── queue drivers ────────────────────────────────────────────────────────────

interface QueueDriver {
  name: string;
  create(): JobQueue;
  /** Lets the driver settle; BullMQ is asynchronous where the in-memory queue is not. */
  settle(queue: JobQueue): Promise<void>;
}

const queueDrivers: QueueDriver[] = [
  {
    name: 'in-memory',
    create: () => new InMemoryQueue(systemClock),
    settle: async (queue) => {
      await (queue as InMemoryQueue).runUntilIdle();
    },
  },
];

if (REDIS_URL) {
  queueDrivers.push({
    name: 'bullmq/redis',
    create: () => new BullMqQueue(REDIS_URL, 4),
    settle: async () => {
      /* handled per test by waiting on the expectation */
    },
  });
}

/** Polls until `check` is true or the budget runs out — BullMQ is genuinely async. */
async function eventually(check: () => boolean, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('condition was not met before the timeout');
}

for (const driver of queueDrivers) {
  describe(`queue · ${driver.name}`, () => {
    let queue: JobQueue;
    // A unique queue name per test keeps runs from inheriting each other's Redis state.
    let name: string;

    beforeEach(() => {
      queue = driver.create();
      name = `test-${newId()}`;
    });

    afterEach(async () => {
      await queue.close();
    });

    it('delivers a job with its payload intact', async () => {
      const seen: Array<{ id: string; attempt: number }> = [];
      queue.register<{ videoId: string; nested: { deep: number[] } }>(name, async (job) => {
        seen.push({ id: job.data.videoId, attempt: job.attempt });
        expect(job.data.nested.deep).toEqual([1, 2, 3]);
        expect(job.name).toBe('advance');
        expect(job.queue).toBe(name);
      });
      await queue.start();

      await queue.enqueue(name, 'advance', { videoId: 'v-1', nested: { deep: [1, 2, 3] } });
      await driver.settle(queue);
      await eventually(() => seen.length === 1);

      expect(seen[0]).toMatchObject({ id: 'v-1', attempt: 1 });
    });

    it('retries a failing job up to maxAttempts and then stops', async () => {
      let attempts = 0;
      queue.register(name, async () => {
        attempts += 1;
        throw new Error('deliberate failure');
      });
      await queue.start();

      await queue.enqueue(name, 'doomed', {}, { maxAttempts: 3 });
      await driver.settle(queue);
      await eventually(() => attempts >= 3, 20_000);

      // Give it a moment to prove it does not go past the cap.
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(attempts).toBe(3);
    });

    it('honours a delay', async () => {
      const timestamps: number[] = [];
      queue.register(name, async () => {
        timestamps.push(Date.now());
      });
      await queue.start();

      const enqueuedAt = Date.now();
      await queue.enqueue(name, 'later', {}, { delayMs: 700 });
      await driver.settle(queue);
      await eventually(() => timestamps.length === 1);

      if (driver.name !== 'in-memory') {
        // The in-memory clock can jump; a real queue must actually wait.
        expect(timestamps[0]! - enqueuedAt).toBeGreaterThanOrEqual(600);
      }
    });

    it('treats an explicit job id as an idempotency key', async () => {
      let runs = 0;
      queue.register(name, async () => {
        runs += 1;
      });
      await queue.start();

      const jobId = `idem-${newId()}`;
      await queue.enqueue(name, 'once', { n: 1 }, { jobId });
      await queue.enqueue(name, 'once', { n: 2 }, { jobId });
      await driver.settle(queue);
      await eventually(() => runs >= 1);

      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(runs).toBe(1);
    });

    it('reports counts the admin screen can show', async () => {
      let handled = 0;
      queue.register(name, async () => {
        handled += 1;
      });
      await queue.start();
      await queue.enqueue(name, 'a', {});
      await driver.settle(queue);
      await eventually(() => handled === 1);

      const counts = await queue.counts(name);
      expect(counts).toHaveProperty('waiting');
      expect(counts).toHaveProperty('active');
      expect(counts).toHaveProperty('failed');
      expect(typeof counts.completed).toBe('number');
    });
  });
}

// ── storage drivers ──────────────────────────────────────────────────────────

interface StorageDriver {
  name: string;
  create(dir: string): Storage;
}

const storageDrivers: StorageDriver[] = [
  { name: 'local', create: (dir) => new LocalStorage(dir) },
];

/** Started lazily so the fake server only runs when the S3 block does. */
let fakeS3: FakeS3 | undefined;
let fakeS3Endpoint: string | undefined;

storageDrivers.push({
  name: S3_ENDPOINT ? 's3 (live endpoint)' : 's3 (in-process server)',
  create: () =>
    new S3Storage({
      endpoint: S3_ENDPOINT ?? fakeS3Endpoint!,
      region: process.env.TEST_S3_REGION ?? 'us-east-1',
      bucket: process.env.TEST_S3_BUCKET ?? 'factory',
      accessKey: process.env.TEST_S3_ACCESS_KEY ?? 'test-access-key',
      secretKey: process.env.TEST_S3_SECRET_KEY ?? 'test-secret-key',
      forcePathStyle: true,
    }),
});

for (const driver of storageDrivers) {
  describe(`storage · ${driver.name}`, () => {
    let dir: string;
    let storage: Storage;
    const prefix = `test-${newId()}`;

    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), 'ycf-storage-'));
      if (driver.name.startsWith('s3') && !S3_ENDPOINT) {
        fakeS3 = new FakeS3();
        fakeS3Endpoint = await fakeS3.start();
      }
      storage = driver.create(dir);
    });

    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
      await fakeS3?.stop();
      fakeS3 = undefined;
    });

    it('round-trips bytes and reports a stable checksum', async () => {
      const key = `${prefix}/round-trip.bin`;
      const body = Buffer.from('the rendered bytes');

      const stored = await storage.put(key, body, 'application/octet-stream');
      expect(stored.key).toBe(key);
      expect(stored.bytes).toBe(body.length);
      expect(stored.checksum).toHaveLength(64);

      expect((await storage.get(key)).equals(body)).toBe(true);
      // The checksum is content-addressed, so the same bytes give the same digest.
      expect((await storage.put(`${prefix}/copy.bin`, body, 'application/octet-stream')).checksum).toBe(stored.checksum);
    });

    it('reports existence honestly and deletes', async () => {
      const key = `${prefix}/ephemeral.txt`;
      expect(await storage.exists(key)).toBe(false);

      await storage.put(key, 'hello', 'text/plain');
      expect(await storage.exists(key)).toBe(true);

      await storage.delete(key);
      expect(await storage.exists(key)).toBe(false);
    });

    it('materialises an object as a local file FFmpeg can read', async () => {
      const key = StorageKeys.render('chan-1', 'vid-1');
      const body = Buffer.from('pretend mp4');
      await storage.put(key, body, 'video/mp4');

      const workDir = await mkdtemp(join(tmpdir(), 'ycf-work-'));
      try {
        const path = await storage.localPath(key, workDir);
        expect((await readFile(path)).equals(body)).toBe(true);
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    });

    it('uploads from a file on disk, which is how renders are stored', async () => {
      const workDir = await mkdtemp(join(tmpdir(), 'ycf-src-'));
      try {
        const source = join(workDir, 'final.mp4');
        const body = Buffer.alloc(256 * 1024, 9);
        await writeFile(source, body);

        const key = `${prefix}/from-file.mp4`;
        const stored = await storage.putFile(key, source, 'video/mp4');
        expect(stored.bytes).toBe(body.length);
        expect((await storage.get(key)).equals(body)).toBe(true);
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    });

    // Only object storage has a multipart path; skipping is honest, a silent no-op is not.
    it.skipIf(driver.name === 'local')('switches to a multipart upload for a large render', async () => {
      const workDir = await mkdtemp(join(tmpdir(), 'ycf-big-'));
      try {
        const source = join(workDir, 'big.mp4');
        // Over the 5 MB threshold, so `putFile` must stream rather than buffer the whole
        // file — this is the path a real 20-minute render takes.
        const body = Buffer.alloc(6 * 1024 * 1024, 4);
        await writeFile(source, body);

        const key = `${prefix}/big.mp4`;
        const stored = await storage.putFile(key, source, 'video/mp4');
        expect(stored.bytes).toBe(body.length);

        const roundTripped = await storage.get(key);
        expect(roundTripped.length).toBe(body.length);
        expect(roundTripped.equals(body)).toBe(true);

        if (fakeS3) expect(fakeS3.usedMultipart()).toBe(true);
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    }, 60_000);

    it('produces a usable URL for a key', () => {
      const url = storage.url(StorageKeys.thumbnail('chan-1', 'vid-1', 'A'));
      expect(url).toContain('chan-1');
      expect(url).toContain('vid-1');
    });

    it('refuses a key that escapes its namespace', async () => {
      for (const key of ['../escape.txt', '/absolute.txt', 'a/../../b.txt']) {
        await expect(storage.put(key, 'x', 'text/plain')).rejects.toMatchObject({
          code: 'invalid_storage_key',
        });
      }
    });
  });
}

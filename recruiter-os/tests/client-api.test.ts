import './setup';
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiRequestError } from '../src/lib/client/api';

type Fetch = typeof globalThis.fetch;
const realFetch = globalThis.fetch;
const realTimeout = (AbortSignal as { timeout?: unknown }).timeout;

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): void {
  globalThis.fetch = handler as Fetch;
}

/** Simulates a browser older than Safari 16, where AbortSignal.timeout does not exist. */
function withoutNativeTimeout(): void {
  delete (AbortSignal as { timeout?: unknown }).timeout;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realTimeout) (AbortSignal as { timeout?: unknown }).timeout = realTimeout;
});

describe('client api', () => {
  test('works on a browser without AbortSignal.timeout', async () => {
    withoutNativeTimeout();
    let sawSignal = false;
    stubFetch(async (_input, init) => {
      sawSignal = init?.signal instanceof AbortSignal;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const result = await api.get<{ ok: boolean }>('/api/candidates');
    assert.deepEqual(result, { ok: true });
    assert.ok(sawSignal, 'the request still carries an abort signal on an old browser');
  });

  test('still passes a signal when the native timeout exists', async () => {
    let sawSignal = false;
    stubFetch(async (_input, init) => {
      sawSignal = init?.signal instanceof AbortSignal;
      return new Response(null, { status: 204 });
    });
    await api.post('/api/tasks', { title: 'x' });
    assert.ok(sawSignal);
  });

  test('reports a dropped connection as a connection problem', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await assert.rejects(api.get('/api/jobs'), (error: unknown) => {
      assert.ok(error instanceof ApiRequestError);
      assert.match(error.message, /אין חיבור לשרת/);
      return true;
    });
  });

  test('does not disguise a browser bug as a connection problem', async () => {
    // Anything that is not a network failure must surface as itself, or a real defect
    // hides behind "check your internet" forever.
    stubFetch(async () => {
      throw new ReferenceError('someHelper is not defined');
    });
    await assert.rejects(api.get('/api/jobs'), (error: unknown) => {
      assert.ok(error instanceof ApiRequestError);
      assert.match(error.message, /someHelper is not defined/);
      assert.doesNotMatch(error.message, /אין חיבור לשרת/);
      return true;
    });
  });

  test('turns an HTML error page into a readable message, not a parse crash', async () => {
    stubFetch(async () => new Response('<html><body>upstream error</body></html>', { status: 502 }));
    await assert.rejects(api.get('/api/candidates'), (error: unknown) => {
      assert.ok(error instanceof ApiRequestError);
      assert.equal(error.status, 502);
      assert.match(error.message, /upstream error/);
      return true;
    });
  });

  test('an HTML error page from an upload reads the same way', async () => {
    stubFetch(async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }));
    await assert.rejects(api.upload('/api/cv/bulk', new FormData()), (error: unknown) => {
      assert.ok(error instanceof ApiRequestError);
      assert.match(error.message, /502 Bad Gateway/);
      return true;
    });
  });

  test('a cancelled request says it was cancelled', async () => {
    withoutNativeTimeout();
    stubFetch(async (_input, init) => {
      // The page unmounted mid-flight: an abort that is not the timeout firing.
      const error = new Error('aborted');
      error.name = 'AbortError';
      void init;
      throw error;
    });
    await assert.rejects(api.get('/api/candidates'), (error: unknown) => {
      assert.ok(error instanceof ApiRequestError);
      assert.match(error.message, /בוטלה/);
      return true;
    });
  });
});

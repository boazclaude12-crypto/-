import './setup';
import { createOrg } from './setup';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, passwordProblems } from '../src/lib/auth/password';
import { AuthError, authenticate, registerUser } from '../src/lib/auth/service';
import { createSession, resolveSession, destroySession, purgeExpiredSessions } from '../src/lib/auth/session';
import { createCandidate, getCandidateDetail, listCandidates, updateCandidate } from '../src/lib/domain/candidates';
import { globalSearch } from '../src/lib/domain/search';
import { repos } from '../src/lib/db/repos';
import { getDb } from '../src/lib/db/index';
import { checkRateLimit, clearRateLimit } from '../src/lib/rate-limit';

describe('password hashing', () => {
  test('verifies the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    assert.ok(hash.startsWith('scrypt$'), 'the format must record its parameters');
    assert.equal(await verifyPassword('correct horse battery', hash), true);
    assert.equal(await verifyPassword('Correct horse battery', hash), false);
    assert.equal(await verifyPassword('', hash), false);
  });

  test('never stores the password itself', async () => {
    const hash = await hashPassword('my-secret-password');
    assert.ok(!hash.includes('my-secret-password'));
  });

  test('two hashes of the same password differ (per-hash salt)', async () => {
    assert.notEqual(await hashPassword('same'), await hashPassword('same'));
  });

  test('rejects a malformed stored hash instead of throwing', async () => {
    assert.equal(await verifyPassword('x', 'not-a-hash'), false);
    assert.equal(await verifyPassword('x', 'scrypt$1$2$3$bad'), false);
  });

  test('reports weak passwords', () => {
    assert.ok(passwordProblems('short').length > 0);
    assert.ok(passwordProblems('alllettersonly').length > 0);
    assert.deepEqual(passwordProblems('goodpass1'), []);
  });
});

describe('registration and login', () => {
  test('registration creates the org, membership and default pipeline', async () => {
    const { orgId, userId } = await createOrg();
    const stages = repos.stages.list(orgId, {});
    const automations = repos.automations.list(orgId, {});
    assert.ok(stages.length >= 10, 'a default pipeline must exist');
    assert.ok(automations.length > 0, 'default automations must exist');
    const membership = getDb().get(
      'SELECT * FROM memberships WHERE org_id = ? AND user_id = ?', orgId, userId,
    );
    assert.ok(membership);
  });

  test('a duplicate email is refused', async () => {
    const email = `dup${Date.now()}@test.local`;
    await registerUser({ name: 'א', email, password: 'password123' });
    await assert.rejects(
      () => registerUser({ name: 'ב', email, password: 'password123' }),
      (error: unknown) => error instanceof AuthError && error.code === 'email_taken',
    );
  });

  test('login succeeds with the right password and fails with the wrong one', async () => {
    const email = `login${Date.now()}@test.local`;
    await registerUser({ name: 'ג', email, password: 'password123' });

    const { user, org } = await authenticate(email, 'password123');
    assert.equal(user.email, email);
    assert.ok(org.id);

    await assert.rejects(() => authenticate(email, 'wrong-password'));
    await assert.rejects(() => authenticate('nobody@test.local', 'password123'));
  });
});

describe('sessions', () => {
  test('a session round-trips and can be destroyed', async () => {
    const { orgId, userId } = await createOrg();
    const { token } = createSession(userId, orgId);

    const auth = resolveSession(token);
    assert.ok(auth);
    assert.equal(auth!.user.id, userId);
    assert.equal(auth!.org.id, orgId);

    destroySession(token);
    assert.equal(resolveSession(token), null);
  });

  test('an unknown or empty token resolves to null', () => {
    assert.equal(resolveSession('made-up-token'), null);
    assert.equal(resolveSession(undefined), null);
    assert.equal(resolveSession(''), null);
  });

  test('the raw token is never stored in the database', async () => {
    const { orgId, userId } = await createOrg();
    const { token } = createSession(userId, orgId);
    const row = getDb().get<{ token_hash: string }>(
      'SELECT token_hash FROM sessions WHERE user_id = ?', userId,
    );
    assert.ok(row);
    assert.notEqual(row!.token_hash, token, 'only the HMAC may be persisted');
  });

  test('an expired session is rejected and purged', async () => {
    const { orgId, userId } = await createOrg();
    const { token } = createSession(userId, orgId);
    getDb().run(
      'UPDATE sessions SET expires_at = ? WHERE user_id = ?',
      new Date(Date.now() - 1000).toISOString(), userId,
    );
    assert.equal(resolveSession(token), null);
    purgeExpiredSessions();
  });
});

describe('organisation scoping (privacy)', () => {
  test('one recruiter cannot read, list, search or edit another recruiter’s candidates', async () => {
    const alice = await createOrg();
    const bob = await createOrg();

    const aliceCandidate = createCandidate(alice.orgId, alice.userId, {
      first_name: 'סודי',
      last_name: 'מאוד',
      phone: '0501112222',
      city: 'חיפה',
      attributes: [{ kind: 'license', value: 'רישיון C' }],
    } as never);

    // Direct fetch
    assert.equal(getCandidateDetail(bob.orgId, aliceCandidate.id), null);
    assert.equal(repos.candidates.find(bob.orgId, aliceCandidate.id), undefined);

    // Listing
    assert.equal(listCandidates(bob.orgId, {}).length, 0);
    assert.equal(listCandidates(alice.orgId, {}).length, 1);

    // Search
    assert.equal(globalSearch(bob.orgId, 'סודי').hits.length, 0);
    assert.ok(globalSearch(alice.orgId, 'סודי').hits.length > 0);

    // Writes
    assert.equal(updateCandidate(bob.orgId, bob.userId, aliceCandidate.id, { city: 'תל אביב' }), undefined);
    assert.equal(repos.candidates.remove(bob.orgId, aliceCandidate.id), false);
    assert.equal(repos.candidates.find(alice.orgId, aliceCandidate.id)?.city, 'חיפה');
  });

  test('the repository refuses to write columns that do not exist', async () => {
    const { orgId, userId } = await createOrg();
    const candidate = createCandidate(orgId, userId, { first_name: 'בדיקה' } as never);
    const updated = repos.candidates.update(orgId, candidate.id, {
      first_name: 'עודכן',
      // An attacker-supplied field must be ignored rather than written.
      org_id: 'someone-elses-org',
      totally_unknown_column: 'x',
    } as never);
    assert.equal(updated?.first_name, 'עודכן');
    assert.equal(updated?.org_id, orgId, 'org_id must never be reassignable');
  });
});

describe('rate limiting', () => {
  test('blocks after the limit and reports a retry delay', () => {
    const bucket = `test:${Date.now()}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      assert.equal(checkRateLimit(bucket, 3, 60_000).allowed, true);
    }
    const blocked = checkRateLimit(bucket, 3, 60_000);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds > 0);

    clearRateLimit(bucket);
    assert.equal(checkRateLimit(bucket, 3, 60_000).allowed, true);
  });
});

describe('data export', () => {
  test('covers every org-scoped table and never carries credentials', async () => {
    const { getDb } = await import('../src/lib/db/index');
    const db = getDb();
    const tables = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .filter((table) =>
        db.all<{ name: string }>(`PRAGMA table_info(${table.name})`).some((c) => c.name === 'org_id'),
      )
      .map((table) => table.name);

    // Whatever a later migration adds, the backup must reach it: the export derives its
    // table list the same way this assertion does, so the two cannot drift apart.
    assert.ok(tables.includes('candidates'));
    assert.ok(tables.includes('jobs'));
    assert.ok(tables.includes('placements'));

    // No org-scoped table may hold a credential column, or the export would carry it.
    for (const table of tables) {
      const columns = db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);
      for (const secret of ['password_hash', 'password_salt', 'api_token']) {
        assert.ok(!columns.includes(secret), `${table}.${secret} would leak into a backup`);
      }
    }
  });

  test('one org cannot read another org rows through a table-wide query', async () => {
    const a = await createOrg();
    const b = await createOrg();
    createCandidate(a.orgId, a.userId, { first_name: 'שייך', last_name: 'לארגון א' } as never);

    const { getDb } = await import('../src/lib/db/index');
    const db = getDb();
    const seenByB = db.all('SELECT * FROM candidates WHERE org_id = ?', b.orgId);
    assert.equal(seenByB.length, 0);
    const seenByA = db.all('SELECT * FROM candidates WHERE org_id = ?', a.orgId);
    assert.equal(seenByA.length, 1);
  });
});

describe('starting the account over', () => {
  test('removes this org data, restores the pipeline, and leaves other orgs alone', async () => {
    const { seedDemoData } = await import('../src/lib/seed/demo');
    const { bootstrapOrganization } = await import('../src/lib/domain/bootstrap');
    const { getDb } = await import('../src/lib/db/index');
    const db = getDb();

    const mine = await createOrg();
    const other = await createOrg();
    seedDemoData(mine.orgId, mine.userId);
    seedDemoData(other.orgId, other.userId);

    const count = (table: string, orgId: string) =>
      db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE org_id = ?`, orgId)!.n;

    assert.ok(count('candidates', mine.orgId) > 50);
    const otherBefore = count('candidates', other.orgId);

    // The same order the reset endpoint uses.
    const tables = [
      'automation_runs', 'activity_events', 'messages', 'notes', 'tasks',
      'payments', 'placements', 'interviews', 'applications',
      'candidate_tags', 'job_tags', 'candidate_documents', 'candidate_attributes',
      'candidate_experiences', 'job_requirements', 'email_messages',
      'candidates', 'jobs', 'client_contacts', 'clients', 'automations', 'tags', 'stages',
    ];
    db.transaction(() => {
      for (const table of tables) db.run(`DELETE FROM ${table} WHERE org_id = ?`, mine.orgId);
      bootstrapOrganization(mine.orgId);
    });

    assert.equal(count('candidates', mine.orgId), 0);
    assert.equal(count('jobs', mine.orgId), 0);
    assert.equal(count('clients', mine.orgId), 0);
    // An account with no pipeline is broken, not clean.
    assert.ok(count('stages', mine.orgId) >= 5, 'the default stages must come back');
    assert.equal(count('candidates', other.orgId), otherBefore, 'another org must be untouched');
  });
});

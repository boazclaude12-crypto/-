import './setup';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { encryptSecret, decryptSecret } from '../src/lib/crypto';

describe('credential encryption', () => {
  test('round-trips a secret', () => {
    const secret = 'abcd efgh ijkl mnop';
    assert.equal(decryptSecret(encryptSecret(secret)), secret);
  });

  test('never stores the plaintext', () => {
    const encrypted = encryptSecret('hunter2-app-password');
    assert.ok(!encrypted.includes('hunter2'));
    assert.ok(encrypted.startsWith('v1.'));
  });

  test('produces a different ciphertext each time', () => {
    // A repeated IV would leak that two accounts share a password.
    assert.notEqual(encryptSecret('same'), encryptSecret('same'));
  });

  test('rejects a tampered ciphertext instead of returning wrong bytes', () => {
    const encrypted = encryptSecret('sensitive');
    const parts = encrypted.split('.');
    const body = Buffer.from(parts[3]!, 'base64url');
    body[0] ^= 0xff;
    parts[3] = body.toString('base64url');
    assert.equal(decryptSecret(parts.join('.')), null);
  });

  test('returns null for junk rather than throwing', () => {
    assert.equal(decryptSecret('not-a-secret'), null);
    assert.equal(decryptSecret(''), null);
    assert.equal(decryptSecret('v2.a.b.c'), null);
  });
});

describe('stored mailbox credentials', () => {
  test('are written encrypted and read back correctly', async () => {
    const { createOrg } = await import('./setup');
    const { repos } = await import('../src/lib/db/repos');
    const { credentialsFor, mailboxFor } = await import('../src/lib/email/sync');
    const { getDb } = await import('../src/lib/db/index');
    const { orgId } = await createOrg();

    repos.emailAccounts.create(orgId, {
      email: 'desk@example.com',
      host: 'imap.example.com',
      port: 993,
      secure: 1,
      password_enc: encryptSecret('abcd efgh ijkl mnop'),
      folder: 'INBOX',
      enabled: 1,
    });

    // What is actually on disk must not contain the password.
    const raw = getDb().get<{ password_enc: string }>(
      'SELECT password_enc FROM email_accounts WHERE org_id = ?', orgId,
    );
    assert.ok(!raw!.password_enc.includes('abcd'), 'the password must not be stored in the clear');

    const credentials = credentialsFor(mailboxFor(orgId)!);
    assert.equal(credentials!.password, 'abcd efgh ijkl mnop');
    assert.equal(credentials!.user, 'desk@example.com');
  });

  test('a mailbox belongs to one org only', async () => {
    const { createOrg } = await import('./setup');
    const { repos } = await import('../src/lib/db/repos');
    const { mailboxFor } = await import('../src/lib/email/sync');
    const a = await createOrg();
    const b = await createOrg();

    repos.emailAccounts.create(a.orgId, {
      email: 'a@example.com', host: 'imap.example.com', port: 993, secure: 1,
      password_enc: encryptSecret('secret-a'), folder: 'INBOX', enabled: 1,
    });

    assert.equal(mailboxFor(a.orgId)?.email, 'a@example.com');
    assert.equal(mailboxFor(b.orgId), null, 'another org must not see it');
  });
});

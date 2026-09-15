import { getDb } from '../src/lib/db/index';
import { registerUser, findUserByEmail } from '../src/lib/auth/service';
import { hasData, seedDemoData } from '../src/lib/seed/demo';
import { repos } from '../src/lib/db/repos';

/**
 * Creates (or reuses) the demo account and fills it with a working desk's worth of data.
 * Credentials are printed at the end so the app can be opened immediately.
 */
const EMAIL = process.env.DEMO_EMAIL || 'demo@recruiter-os.local';
const PASSWORD = process.env.DEMO_PASSWORD || 'demo1234';

async function main() {
  getDb(); // opens the database and applies migrations

  const existing = findUserByEmail(EMAIL);
  let userId: string;
  let orgId: string;

  if (existing) {
    userId = existing.id;
    const org = getDb().get<{ id: string }>(
      'SELECT o.id FROM organizations o JOIN memberships m ON m.org_id = o.id WHERE m.user_id = ? LIMIT 1',
      existing.id,
    );
    if (!org) throw new Error('Demo user exists without an organisation.');
    orgId = org.id;
    console.log(`Reusing existing demo account (${EMAIL}).`);
  } else {
    const created = await registerUser({
      name: 'דנה — רכזת גיוס',
      email: EMAIL,
      password: PASSWORD,
      orgName: 'הגיוס של דנה',
    });
    userId = created.user.id;
    orgId = created.org.id;
    console.log(`Created demo account ${EMAIL}.`);
  }

  if (hasData(orgId)) {
    console.log('Organisation already contains data — skipping seed.');
    console.log(`  candidates: ${repos.candidates.count(orgId)}, jobs: ${repos.jobs.count(orgId)}, clients: ${repos.clients.count(orgId)}`);
    return;
  }

  const result = seedDemoData(orgId, userId);
  console.log('Seeded demo data:');
  for (const [key, value] of Object.entries(result)) console.log(`  ${key}: ${value}`);
  console.log(`\nSign in with:  ${EMAIL}  /  ${PASSWORD}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

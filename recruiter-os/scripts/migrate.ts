import { createDb, migrate, migrationsDir } from '../src/lib/db/index';

const file = process.env.DATABASE_FILE || './data/recruiter.db';
const db = createDb(file);
const applied = migrate(db, migrationsDir());

if (applied.length === 0) console.log(`No pending migrations (${file}).`);
else console.log(`Applied ${applied.length} migration(s) to ${file}:\n  ${applied.join('\n  ')}`);

db.close();

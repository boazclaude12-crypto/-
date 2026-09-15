import fs from 'node:fs';
import path from 'node:path';

/** Deletes the database file and uploaded documents so `db:seed` starts clean. */
const file = path.resolve(process.env.DATABASE_FILE || './data/recruiter.db');
const uploads = path.resolve(process.env.UPLOAD_DIR || './data/uploads');

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const target = `${file}${suffix}`;
  if (fs.existsSync(target)) {
    fs.rmSync(target);
    console.log(`Removed ${target}`);
  }
}
if (fs.existsSync(uploads)) {
  fs.rmSync(uploads, { recursive: true, force: true });
  console.log(`Removed ${uploads}`);
}
console.log('Reset complete. Run `npm run db:seed` to recreate the demo account.');

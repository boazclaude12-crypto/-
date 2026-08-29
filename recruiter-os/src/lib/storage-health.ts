import fs from 'node:fs';
import path from 'node:path';
import { env } from './env';

export interface StorageHealth {
  /** Directory holding the database and the uploaded CVs. */
  dataDir: string;
  /** True when that directory is its own mount — i.e. a volume that survives a deploy. */
  persistent: boolean;
  /** Null outside a container, where the question does not arise. */
  containerised: boolean;
  databaseBytes: number;
  uploadBytes: number;
  uploadCount: number;
  /** Capacity of the volume, and what is left. Null when the filesystem cannot say. */
  totalBytes: number | null;
  freeBytes: number | null;
}

/**
 * Whether `dir` is a mount point of its own.
 *
 * On a managed host the application directory is rebuilt on every deploy while an
 * attached volume is mounted over one path inside it. That mount is the only thing
 * standing between the recruiter's database and an empty screen after the next push,
 * and it is invisible from the application — so it is read from the kernel's mount
 * table rather than assumed.
 */
function isMountPoint(dir: string): boolean {
  try {
    const resolved = path.resolve(dir);
    const mounts = fs.readFileSync('/proc/self/mounts', 'utf8');
    return mounts.split('\n').some((line) => line.split(' ')[1] === resolved);
  } catch {
    return false;
  }
}

function directorySize(dir: string): { bytes: number; files: number } {
  let bytes = 0;
  let files = 0;
  const walk = (current: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        try {
          bytes += fs.statSync(full).size;
          files += 1;
        } catch {
          /* removed between readdir and stat */
        }
      }
    }
  };
  walk(dir);
  return { bytes, files };
}

/**
 * Free space on the volume holding `dir`.
 *
 * Managed volumes start small — a starter plan may allow only a few hundred megabytes —
 * and CVs accumulate quietly. SQLite stops accepting writes when the disk fills, so the
 * number is worth showing while there is still time to act on it.
 */
function capacityOf(dir: string): { total: number | null; free: number | null } {
  try {
    const stats = fs.statfsSync(dir);
    return { total: stats.blocks * stats.bsize, free: stats.bavail * stats.bsize };
  } catch {
    return { total: null, free: null };
  }
}

function sizeOf(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

export function storageHealth(): StorageHealth {
  const databaseFile = path.resolve(env.databaseFile);
  const dataDir = path.dirname(databaseFile);
  const uploads = directorySize(env.uploadDir);
  const capacity = capacityOf(dataDir);

  return {
    dataDir,
    persistent: isMountPoint(dataDir),
    containerised: fs.existsSync('/.dockerenv'),
    // WAL and shared-memory files hold committed data too; a size that ignored them
    // would under-report right after a busy hour.
    databaseBytes:
      sizeOf(databaseFile) + sizeOf(`${databaseFile}-wal`) + sizeOf(`${databaseFile}-shm`),
    uploadBytes: uploads.bytes,
    uploadCount: uploads.files,
    totalBytes: capacity.total,
    freeBytes: capacity.free,
  };
}

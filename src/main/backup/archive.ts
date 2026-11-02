import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Orbit backups (roadmap P4.7): one `.orbitbackup` file holding the database and your saved
 * screenshots, optionally encrypted with a passphrase (AES-256-GCM, key from scrypt). Nothing
 * here touches the network: a backup goes only to the folder you choose. Pure (node:crypto).
 *
 * Layout: "ORBITARC1" · u32 manifest length · manifest JSON · the files' bytes, in order.
 * Encrypted: "ORBITENC1" · salt (16) · iv (12) · tag (16) · the archive, encrypted.
 */

const ARCHIVE_MAGIC = Buffer.from('ORBITARC1');
const CRYPT_MAGIC = Buffer.from('ORBITENC1');
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export type BackupFile = { path: string; data: Buffer };
export type BackupManifest = {
  version: 1;
  createdAt: number;
  appVersion: string;
  files: { path: string; size: number }[];
};

/** Only plain relative paths inside the backup ("orbit.db", "Captures/a.png"). */
export function safePath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length < 300 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

export function packBackup(
  files: readonly BackupFile[],
  appVersion: string,
  now = Date.now(),
): Buffer {
  for (const file of files) if (!safePath(file.path)) throw new Error(`Bad path: ${file.path}`);
  const manifest: BackupManifest = {
    version: 1,
    createdAt: now,
    appVersion,
    files: files.map((f) => ({ path: f.path, size: f.data.length })),
  };
  const json = Buffer.from(JSON.stringify(manifest), 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(json.length);
  return Buffer.concat([ARCHIVE_MAGIC, length, json, ...files.map((f) => f.data)]);
}

export class BackupError extends Error {}

export function unpackBackup(archive: Buffer): { manifest: BackupManifest; files: BackupFile[] } {
  if (!archive.subarray(0, ARCHIVE_MAGIC.length).equals(ARCHIVE_MAGIC)) {
    throw new BackupError('This isn’t an Orbit backup');
  }
  let at = ARCHIVE_MAGIC.length;
  const length = archive.readUInt32BE(at);
  at += 4;
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(archive.subarray(at, at + length).toString('utf8')) as BackupManifest;
  } catch {
    throw new BackupError('This backup is damaged');
  }
  at += length;
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) {
    throw new BackupError('This backup is from a newer Orbit');
  }
  const files: BackupFile[] = [];
  for (const entry of manifest.files) {
    if (!safePath(entry.path) || !Number.isInteger(entry.size) || entry.size < 0) {
      throw new BackupError('This backup is damaged');
    }
    if (at + entry.size > archive.length) throw new BackupError('This backup is incomplete');
    files.push({ path: entry.path, data: archive.subarray(at, at + entry.size) });
    at += entry.size;
  }
  return { manifest, files };
}

export function isEncrypted(data: Buffer): boolean {
  return data.subarray(0, CRYPT_MAGIC.length).equals(CRYPT_MAGIC);
}

export function encryptBackup(archive: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, SCRYPT);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(archive), cipher.final()]);
  return Buffer.concat([CRYPT_MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

export function decryptBackup(data: Buffer, passphrase: string): Buffer {
  if (!isEncrypted(data)) throw new BackupError('This backup isn’t encrypted');
  let at = CRYPT_MAGIC.length;
  const salt = data.subarray(at, (at += 16));
  const iv = data.subarray(at, (at += 12));
  const tag = data.subarray(at, (at += 16));
  const key = scryptSync(passphrase, salt, 32, SCRYPT);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(data.subarray(at)), decipher.final()]);
  } catch {
    throw new BackupError('Wrong passphrase, or the backup is damaged');
  }
}

/** "Orbit Backup 2026-11-02 14.30.orbitbackup" (local time). */
export function backupFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Orbit Backup ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.orbitbackup`;
}

/** Backups in a folder beyond the newest `keep`, to delete (by name: they sort by date). */
export function backupsBeyond(names: readonly string[], keep: number): string[] {
  return names
    .filter((n) => /^Orbit Backup \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.orbitbackup$/.test(n))
    .sort()
    .reverse()
    .slice(keep);
}

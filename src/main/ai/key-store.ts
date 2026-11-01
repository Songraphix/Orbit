import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

/** Encrypts with the macOS Keychain (Electron's `safeStorage`); a fake in tests. */
export type Cipher = {
  isEncryptionAvailable(): boolean;
  encryptString(text: string): Buffer;
  decryptString(data: Buffer): string;
};

/**
 * The user's Anthropic API key (F-29, PLAN.md section 4.3): encrypted with the Keychain-backed
 * `safeStorage` and kept in its own file, never in the database, never sent to a renderer.
 */
export class AiKeyStore {
  /** Decrypted once, then kept in memory (undefined = not read yet). */
  private cached: string | null | undefined;

  constructor(
    private readonly path: string,
    private readonly cipher: Cipher,
  ) {}

  get canStore(): boolean {
    return this.cipher.isEncryptionAvailable();
  }

  has(): boolean {
    return this.get() !== null;
  }

  get(): string | null {
    if (this.cached !== undefined) return this.cached;
    if (!existsSync(this.path)) return (this.cached = null);
    try {
      this.cached = this.cipher.decryptString(readFileSync(this.path));
    } catch {
      this.cached = null; // e.g. the Keychain item was removed
    }
    return this.cached;
  }

  set(key: string): void {
    if (!this.canStore) throw new Error('Secure storage isn’t available on this Mac');
    writeFileSync(this.path, this.cipher.encryptString(key), { mode: 0o600 });
    this.cached = key;
  }

  clear(): void {
    rmSync(this.path, { force: true });
    this.cached = null;
  }
}

/** An Anthropic API key, roughly: what people paste (trimmed), or null if it isn't one. */
export function cleanApiKey(input: string): string | null {
  const key = input.trim();
  return /^sk-ant-[A-Za-z0-9_-]{20,200}$/.test(key) ? key : null;
}

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { StorageBackend } from './storage-backend.js';

export class LocalStorage implements StorageBackend {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

  async save(key: string, data: Buffer | NodeJS.ReadableStream, contentType: string): Promise<void> {
    const filePath = this.resolveAndGuard(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    if (Buffer.isBuffer(data)) {
      await fs.writeFile(filePath, data);
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of data) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as unknown as Uint8Array));
      }
      await fs.writeFile(filePath, Buffer.concat(chunks));
    }
  }

  async get(key: string): Promise<Buffer> {
    const filePath = this.resolveAndGuard(key);
    return fs.readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolveAndGuard(key);
    try {
      await fs.unlink(filePath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  getUrl(key: string): string {
    return `/media/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.resolveAndGuard(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async destroy(): Promise<void> {}

  private resolveAndGuard(key: string): string {
    const resolved = path.resolve(this.rootDir, key);
    if (!resolved.startsWith(this.rootDir + path.sep) && resolved !== this.rootDir) {
      throw new Error(`Path traversal detected: key "${key}" resolves outside storage root`);
    }
    return resolved;
  }
}

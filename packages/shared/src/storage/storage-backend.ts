export interface StorageBackend {
  save(key: string, data: Buffer | NodeJS.ReadableStream, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
  exists(key: string): Promise<boolean>;
}

export interface StorageBackend {
  /**
   * Persist data for a key. S3 stores the provided contentType as object metadata;
   * local storage ignores it because Express static serving infers MIME type from the file extension.
   */
  save(key: string, data: Buffer | NodeJS.ReadableStream, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
  exists(key: string): Promise<boolean>;
  destroy?(): Promise<void>;
}

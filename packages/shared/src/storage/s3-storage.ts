import type { StorageBackend } from './storage-backend.js';

type S3Sdk = typeof import('@aws-sdk/client-s3');
type S3SdkLoader = () => Promise<S3Sdk>;

interface LoadedS3Client {
  client: InstanceType<S3Sdk['S3Client']>;
  PutObjectCommand: S3Sdk['PutObjectCommand'];
  GetObjectCommand: S3Sdk['GetObjectCommand'];
  DeleteObjectCommand: S3Sdk['DeleteObjectCommand'];
  HeadObjectCommand: S3Sdk['HeadObjectCommand'];
}

export interface S3StorageConfig {
  endpoint: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  region?: string;
}

export class S3Storage implements StorageBackend {
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly config: S3StorageConfig;
  private readonly loadSdk: S3SdkLoader;
  private clientPromise?: Promise<LoadedS3Client>;

  constructor(
    config: S3StorageConfig,
    loadSdk: S3SdkLoader = () => import('@aws-sdk/client-s3'),
  ) {
    this.bucket = config.bucket;
    this.endpoint = config.endpoint;
    this.config = config;
    this.loadSdk = loadSdk;
  }

  private getClient(): Promise<LoadedS3Client> {
    this.clientPromise ??= this.createClient().catch((error) => {
      this.clientPromise = undefined;
      throw error;
    });
    return this.clientPromise;
  }

  private async createClient(): Promise<LoadedS3Client> {
    let sdk: S3Sdk;
    try {
      sdk = await this.loadSdk();
    } catch (error) {
      throw new Error(
        'S3 backend requires optional dependency "@aws-sdk/client-s3". Install @aws-sdk/client-s3 in the runtime package or set MEDIA_STORAGE_BACKEND=local.',
        { cause: error },
      );
    }

    const client = new sdk.S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region || 'us-east-1',
      credentials: {
        accessKeyId: this.config.accessKey,
        secretAccessKey: this.config.secretKey,
      },
      forcePathStyle: true,
    });

    return {
      client,
      PutObjectCommand: sdk.PutObjectCommand,
      GetObjectCommand: sdk.GetObjectCommand,
      DeleteObjectCommand: sdk.DeleteObjectCommand,
      HeadObjectCommand: sdk.HeadObjectCommand,
    };
  }

  async save(key: string, data: Buffer | NodeJS.ReadableStream, contentType: string): Promise<void> {
    const { client, PutObjectCommand } = await this.getClient();
    let body: Buffer;
    if (Buffer.isBuffer(data)) {
      body = data;
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of data) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as unknown as Uint8Array));
      }
      body = Buffer.concat(chunks);
    }

    await client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
  }

  async get(key: string): Promise<Buffer> {
    const { client, GetObjectCommand } = await this.getClient();
    const response = await client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));

    if (!response.Body) {
      throw new Error(`S3 object "${key}" has no body`);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    const { client, DeleteObjectCommand } = await this.getClient();
    await client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }

  getUrl(key: string): string {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    const { client, HeadObjectCommand } = await this.getClient();
    try {
      await client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      return true;
    } catch (error: unknown) {
      if ((error as Error).name === 'NotFound' || (error as Error).name === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
  }

  async destroy(): Promise<void> {
    if (!this.clientPromise) {
      return;
    }

    const { client } = await this.clientPromise;
    client.destroy();
    this.clientPromise = undefined;
  }
}

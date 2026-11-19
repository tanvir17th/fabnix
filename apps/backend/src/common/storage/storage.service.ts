import { Inject, Injectable } from '@nestjs/common';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { APP_CONFIG, AppConfig } from '../../config/app-config';

/** S3-compatible object storage for product photos, logos and invoice assets (§7.3). */
@Injectable()
export class StorageService {
  private readonly s3?: S3Client;
  private readonly root: string;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.root = resolve(config.storage.localDir);
    if (config.storage.driver === 's3') {
      const s3 = config.storage.s3;
      this.s3 = new S3Client({
        region: s3.region,
        endpoint: s3.endpoint,
        forcePathStyle: s3.forcePathStyle,
        credentials: s3.accessKeyId && s3.secretAccessKey ? { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey } : undefined,
      });
    }
  }

  get localRoot(): string {
    return this.root;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.config.storage.s3.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      return;
    }
    const path = this.localPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async delete(key: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.config.storage.s3.bucket, Key: key }));
      return;
    }
    await rm(this.localPath(key), { force: true });
  }

  publicUrl(key: string | null | undefined): string | null {
    return key ? `${this.config.storage.publicBaseUrl}/${key}` : null;
  }

  private localPath(key: string): string {
    const path = normalize(join(this.root, key));
    if (!path.startsWith(this.root)) throw new Error('Invalid storage key');
    return path;
  }
}

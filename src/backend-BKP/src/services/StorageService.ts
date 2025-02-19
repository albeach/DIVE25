import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { LoggerService } from './LoggerService';
import { config } from '../config/config';

interface StorageLocation {
    bucket: string;
    key: string;
}

interface FileMetadata {
    classification: string;
    coiTags: string[];
}

interface VersionHistory {
    documentId: string;
    version: number;
    storageLocation: StorageLocation;
    metadata: any;
    comment?: string;
}

export class StorageService {
    private static instance: StorageService;
    private readonly s3Client: S3Client;
    private readonly logger: LoggerService;
    private readonly defaultBucket: string;
    private readonly versionBucket: string;

    private constructor() {
        this.s3Client = new S3Client({
            endpoint: config.storage.endpoint,
            region: config.storage.region,
            credentials: {
                accessKeyId: config.storage.accessKeyId,
                secretAccessKey: config.storage.secretAccessKey
            },
            forcePathStyle: true // Needed for MinIO compatibility
        });

        this.logger = LoggerService.getInstance();
        this.defaultBucket = config.storage.defaultBucket;
        this.versionBucket = config.storage.versionBucket;
    }

    public async uploadFile(
        file: Express.Multer.File,
        metadata: FileMetadata
    ): Promise<StorageLocation> {
        const key = this.generateStorageKey(file.originalname, metadata);

        try {
            await this.s3Client.send(new PutObjectCommand({
                Bucket: this.defaultBucket,
                Key: key,
                Body: file.buffer,
                ContentType: file.mimetype,
                Metadata: {
                    classification: metadata.classification,
                    coiTags: JSON.stringify(metadata.coiTags)
                }
            }));

            return {
                bucket: this.defaultBucket,
                key
            };
        } catch (error) {
            this.logger.log('error', 'Failed to upload file', {
                error,
                filename: file.originalname,
                classification: metadata.classification
            });
            throw new Error('Failed to upload file to storage');
        }
    }

    public async getFileStream(
        bucket: string,
        key: string
    ): Promise<Readable> {
        try {
            const response = await this.s3Client.send(new GetObjectCommand({
                Bucket: bucket,
                Key: key
            }));

            return response.Body as Readable;
        } catch (error) {
            this.logger.log('error', 'Failed to retrieve file', {
                error,
                bucket,
                key
            });
            throw new Error('Failed to retrieve file from storage');
        }
    }

    public async deleteFile(
        bucket: string,
        key: string
    ): Promise<void> {
        try {
            await this.s3Client.send(new DeleteObjectCommand({
                Bucket: bucket,
                Key: key
            }));
        } catch (error) {
            this.logger.log('error', 'Failed to delete file', {
                error,
                bucket,
                key
            });
            throw new Error('Failed to delete file from storage');
        }
    }

    public async calculateChecksum(file: Express.Multer.File): Promise<string> {
        return createHash('sha256')
            .update(file.buffer)
            .digest('hex');
    }

    public async storeVersionHistory(version: VersionHistory): Promise<void> {
        const key = `${version.documentId}/v${version.version}.json`;

        try {
            await this.s3Client.send(new PutObjectCommand({
                Bucket: this.versionBucket,
                Key: key,
                Body: JSON.stringify(version),
                ContentType: 'application/json'
            }));
        } catch (error) {
            this.logger.log('error', 'Failed to store version history', {
                error,
                documentId: version.documentId,
                version: version.version
            });
            throw new Error('Failed to store version history');
        }
    }

    public async getVersionHistory(documentId: string): Promise<VersionHistory[]> {
        try {
            const response = await this.s3Client.send(new GetObjectCommand({
                Bucket: this.versionBucket,
                Key: `${documentId}/versions.json`
            }));

            const body = await response.Body?.transformToString();
            return JSON.parse(body || '[]');
        } catch (error) {
            this.logger.log('error', 'Failed to retrieve version history', {
                error,
                documentId
            });
            return [];
        }
    }

    private generateStorageKey(filename: string, metadata: FileMetadata): string {
        const timestamp = Date.now();
        const hash = createHash('md5')
            .update(`${filename}${timestamp}`)
            .digest('hex');

        return `${metadata.classification}/${hash}/${filename}`;
    }

    public static getInstance(): StorageService {
        if (!StorageService.instance) {
            StorageService.instance = new StorageService();
        }
        return StorageService.instance;
    }
} 
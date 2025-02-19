import { Db, Collection, Document, ObjectId, WithId } from 'mongodb';
import { DatabaseService } from './DatabaseService';
import { LoggerService } from './LoggerService';
import { MetricsService } from './MetricsService';
import { OPAService } from './OPAService';
import {
    NATODocument,
    DocumentContent,
    DocumentMetadata,
    ValidationResult,
    AuthError,
    ClearanceLevel
} from '../types';
import { config } from '../config/config';
import * as crypto from 'crypto';

/**
 * Service responsible for secure document storage and retrieval in the NATO system.
 * Implements encrypted storage, content validation, and security classification
 * enforcement for document contents.
 */
export class DocumentStorageService {
    private static instance: DocumentStorageService;
    private collection: Collection<NATODocument>;
    private readonly db: DatabaseService;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;
    private readonly opa: OPAService;

    // Storage configuration
    private readonly STORAGE_CONFIG = {
        ENCRYPTION: {
            ALGORITHM: 'aes-256-gcm',
            IV_LENGTH: 12,
            AUTH_TAG_LENGTH: 16
        },
        MAX_CONTENT_SIZE: 100 * 1024 * 1024, // 100MB
        ALLOWED_MIME_TYPES: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ]
    };

    private constructor() {
        this.db = DatabaseService.getInstance();
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.opa = OPAService.getInstance();
        this.initializeStorage();
    }

    public static getInstance(): DocumentStorageService {
        if (!DocumentStorageService.instance) {
            DocumentStorageService.instance = new DocumentStorageService();
        }
        return DocumentStorageService.instance;
    }

    /**
     * Initializes storage system with required configuration and validation.
     */
    private async initializeStorage(): Promise<void> {
        try {
            // Get collection from database service
            const db = await this.db.getDb();
            this.collection = db.collection<NATODocument>('documents');

            // Validate encryption configuration
            if (!config.storage.encryptionKey) {
                throw new Error('Storage encryption key not configured');
            }

            await this.createStorageIndexes();
            this.logger.info('Document storage system initialized');
        } catch (error) {
            this.logger.error('Failed to initialize document storage:', error);
            throw new Error('Storage initialization failed');
        }
    }

    /**
     * Stores a new document with proper encryption and security metadata.
     */
    public async storeDocument(
        content: Buffer,
        metadata: DocumentMetadata,
        securityAttributes: Pick<NATODocument, 'clearance' | 'releasableTo' | 'title'> & Partial<NATODocument>
    ): Promise<NATODocument> {
        const startTime = Date.now();

        try {
            // Validate content and metadata
            await this.validateContent(content, metadata);

            // Generate storage location
            const location = this.generateStorageLocation();

            // Encrypt content
            const encryptedContent = await this.encryptContent(content);

            // Calculate content hash
            const hash = this.calculateHash(content);

            // Create document content record
            const documentContent: DocumentContent = {
                location,
                hash,
                size: content.length,
                mimeType: metadata.mimeType
            };

            // Store document in database
            const document = await this.db.createDocument({
                ...securityAttributes,
                content: documentContent,
                metadata: {
                    ...metadata,
                    createdAt: new Date(),
                    lastModified: new Date(),
                    version: 1
                }
            });

            // Store encrypted content
            await this.writeEncryptedContent(location, encryptedContent);

            // Record metrics
            this.metrics.recordDocumentAccess(document.clearance as ClearanceLevel, true, {
                operation: 'store',
                size: content.length,
                duration: Date.now() - startTime
            });

            return document;

        } catch (error) {
            this.logger.error('Document storage failed:', error);
            throw this.createStorageError(error, 'Failed to store document');
        }
    }

    /**
     * Retrieves document content with proper decryption and validation.
     */
    public async retrieveDocument(id: string): Promise<{
        content: Buffer;
        document: NATODocument;
    }> {
        try {
            // Retrieve document metadata
            const document = await this.db.getDocument(id);
            if (!document) {
                throw new Error('Document not found');
            }

            // Read encrypted content
            const encryptedContent = await this.readEncryptedContent(
                document.content.location
            );

            // Decrypt content
            const decryptedContent = await this.decryptContent(encryptedContent);

            // Validate content integrity
            const hash = this.calculateHash(decryptedContent);
            if (hash !== document.content.hash) {
                throw new Error('Document content integrity check failed');
            }

            // Record retrieval
            this.metrics.recordDocumentAccess(document.clearance as ClearanceLevel, true);

            return {
                content: decryptedContent,
                document
            };

        } catch (error) {
            this.logger.error('Document retrieval failed:', error);
            throw this.createStorageError(error, 'Failed to retrieve document');
        }
    }

    /**
     * Updates document content while maintaining version history.
     */
    public async updateDocumentContent(
        id: string,
        newContent: Buffer,
        metadata: Partial<DocumentMetadata>
    ): Promise<NATODocument> {
        try {
            // Retrieve current document
            const currentDocument = await this.db.getDocument(id);
            if (!currentDocument) {
                throw new Error('Document not found');
            }

            // Validate new content
            await this.validateContent(newContent, {
                ...currentDocument.metadata,
                ...metadata
            });

            // Generate new storage location
            const newLocation = this.generateStorageLocation();

            // Encrypt new content
            const encryptedContent = await this.encryptContent(newContent);

            // Calculate new hash
            const hash = this.calculateHash(newContent);

            // Create updated content record
            const updatedContent: DocumentContent = {
                location: newLocation,
                hash: hash,
                size: newContent.length,
                mimeType: metadata.mimeType || currentDocument.content.mimeType
            };

            // Update document in database
            const updatedDocument = await this.db.updateDocument(id, {
                content: updatedContent,
                metadata: {
                    ...currentDocument.metadata,
                    ...metadata,
                    lastModified: new Date(),
                    version: currentDocument.metadata.version + 1
                }
            });

            if (!updatedDocument) {
                throw new Error('Document update failed');
            }

            // Store new encrypted content
            await this.writeEncryptedContent(newLocation, encryptedContent);

            // Archive old content if needed
            if (config.storage.archiveVersions) {
                await this.archiveContent(currentDocument);
            } else {
                await this.deleteEncryptedContent(currentDocument.content.location);
            }

            return updatedDocument;

        } catch (error) {
            this.logger.error('Document content update failed:', error);
            throw this.createStorageError(error, 'Failed to update document content');
        }
    }

    /**
     * Validates document content meets security and format requirements.
     */
    private async validateContent(
        content: Buffer,
        metadata: Partial<DocumentMetadata>
    ): Promise<ValidationResult> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check file size
        if (content.length > this.STORAGE_CONFIG.MAX_CONTENT_SIZE) {
            errors.push('Document exceeds maximum file size');
        }

        // Validate MIME type
        if (metadata.mimeType &&
            !this.STORAGE_CONFIG.ALLOWED_MIME_TYPES.includes(metadata.mimeType)) {
            errors.push('Invalid document type');
        }

        // Check for malware (if configured)
        if (config.storage.malwareScan) {
            const scanResult = await this.scanContent(content);
            if (!scanResult.safe) {
                errors.push('Malware detected in document content');
            }
        }

        // Validate content structure
        const structureValid = await this.validateContentStructure(
            content,
            metadata.mimeType
        );
        if (!structureValid) {
            errors.push('Invalid document structure');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Encrypts document content using configured encryption settings.
     */
    private async encryptContent(content: Buffer): Promise<{
        encrypted: Buffer;
        iv: Buffer;
        authTag: Buffer;
    }> {
        const iv = crypto.randomBytes(this.STORAGE_CONFIG.ENCRYPTION.IV_LENGTH);
        const key = Buffer.from(config.storage.encryptionKey, 'hex');

        const cipher = crypto.createCipheriv(
            this.STORAGE_CONFIG.ENCRYPTION.ALGORITHM,
            key,
            iv
        ) as crypto.CipherGCM;

        cipher.setAAD(Buffer.from('authenticated'));

        const encrypted = Buffer.concat([
            cipher.update(content),
            cipher.final()
        ]);

        return {
            encrypted,
            iv,
            authTag: cipher.getAuthTag()
        };
    }

    /**
     * Decrypts document content and validates integrity.
     */
    private async decryptContent(
        encryptedData: {
            encrypted: Buffer;
            iv: Buffer;
            authTag: Buffer;
        }
    ): Promise<Buffer> {
        const decipher = crypto.createDecipheriv(
            this.STORAGE_CONFIG.ENCRYPTION.ALGORITHM,
            Buffer.from(config.storage.encryptionKey, 'hex'),
            encryptedData.iv,
            { authTagLength: this.STORAGE_CONFIG.ENCRYPTION.AUTH_TAG_LENGTH } as crypto.CipherGCMOptions
        );

        (decipher as crypto.DecipherGCM).setAuthTag(encryptedData.authTag);

        return Buffer.concat([
            decipher.update(encryptedData.encrypted),
            decipher.final()
        ]);
    }

    /**
     * Writes encrypted content to storage location.
     */
    private async writeEncryptedContent(
        location: string,
        encryptedData: {
            encrypted: Buffer;
            iv: Buffer;
            authTag: Buffer;
        }
    ): Promise<void> {
        // Implementation would depend on your storage backend
        // Could be file system, object storage, etc.
    }

    /**
     * Reads encrypted content from storage location.
     */
    private async readEncryptedContent(
        location: string
    ): Promise<{
        encrypted: Buffer;
        iv: Buffer;
        authTag: Buffer;
    }> {
        // Implementation would depend on your storage backend
        // Could be file system, object storage, etc.
        return { encrypted: Buffer.from([]), iv: Buffer.from([]), authTag: Buffer.from([]) };
    }

    /**
     * Generates secure storage location for document content.
     */
    private generateStorageLocation(): string {
        const timestamp = Date.now();
        const random = crypto.randomBytes(16).toString('hex');
        return `${timestamp}-${random}`;
    }

    /**
     * Calculates secure hash of document content.
     */
    private calculateHash(content: Buffer): string {
        return crypto
            .createHash('sha256')
            .update(content)
            .digest('hex');
    }

    /**
     * Archives old document content for version history.
     */
    private async archiveContent(document: NATODocument): Promise<void> {
        // Implementation would depend on your archival strategy
    }

    /**
     * Validates document content structure based on type.
     */
    private async validateContentStructure(
        content: Buffer,
        mimeType?: string
    ): Promise<boolean> {
        // Implementation would depend on document types you need to validate
        return true;
    }

    /**
     * Creates storage-specific database indexes.
     */
    private async createStorageIndexes(): Promise<void> {
        await this.collection.createIndexes([
            {
                key: { 'content.hash': 1 },
                name: 'idx_content_hash'
            },
            {
                key: { 'content.location': 1 },
                name: 'idx_content_location',
                unique: true
            }
        ]);
    }

    /**
     * Scans document content for malware if configured.
     */
    private async scanContent(content: Buffer): Promise<{
        safe: boolean;
        threats?: string[];
    }> {
        // Implementation would depend on your malware scanning solution
        return { safe: true };
    }

    /**
     * Creates typed storage error with proper error codes.
     */
    private createStorageError(
        error: unknown,
        message: string,
        statusCode: number = 500
    ): AuthError {
        const storageError = new Error(message) as AuthError;
        storageError.statusCode = statusCode;
        storageError.code = 'STORAGE_ERROR';
        storageError.details = {
            originalError: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date()
        };
        return storageError;
    }

    /**
     * Deletes encrypted content from storage location.
     */
    private async deleteEncryptedContent(location: string): Promise<void> {
        // Implementation would depend on your storage backend
        // Could be file system, object storage, etc.
    }
}

export default DocumentStorageService.getInstance();
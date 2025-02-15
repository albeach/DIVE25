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
    AuthError
} from '../types';
import { config } from '../config/config';
import * as crypto from 'crypto';
import { ClearanceLevel } from '../types';

/**
 * Service responsible for secure document storage and retrieval in the NATO system.
 * Implements encrypted storage, content validation, and security classification
 * enforcement for document contents.
 */

interface RetentionPolicy {
    clearanceLevel: ClearanceLevel;
    retentionPeriod: number; // in days
    archivalRequired: boolean;
}

export class DocumentStorageService {
    private static instance: DocumentStorageService;
    private readonly db: DatabaseService;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;
    private readonly opa: OPAService;
    private collection!: Collection<NATODocument>;

    // Storage configuration
    private readonly STORAGE_CONFIG = {
        ENCRYPTION_ALGORITHM: 'aes-256-gcm',
        KEY_LENGTH: 32,
        AUTH_TAG_LENGTH: 16,
        ALLOWED_MIME_TYPES: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'application/xml'
        ],
        MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
        CHUNK_SIZE: 5 * 1024 * 1024 // 5MB for streaming
    };

    private readonly STORAGE_METRICS = {
        contentSizeByClassification: new Map<ClearanceLevel, number>(),
        totalDocuments: 0,
        encryptionOperations: {
            success: 0,
            failures: 0,
            averageTime: 0
        }
    };

    private readonly RETENTION_POLICIES: RetentionPolicy[] = [
        {
            clearanceLevel: 'COSMIC TOP SECRET',
            retentionPeriod: 3650, // 10 years
            archivalRequired: true
        },
        {
            clearanceLevel: 'NATO SECRET',
            retentionPeriod: 1825, // 5 years
            archivalRequired: true
        },
        {
            clearanceLevel: 'NATO CONFIDENTIAL',
            retentionPeriod: 730, // 2 years
            archivalRequired: true
        }
    ];
    
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
            // Initialize MongoDB collection
            // this.collection = await this.db.getCollection<NATODocument>('documents');

            // Validate encryption configuration
            // if (!config.storage.encryptionKey) {
            //     throw new Error('Storage encryption key not configured');
            // }

            // Create storage-specific indexes
            // await this.createStorageIndexes();

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
        try {
            // Validate content and metadata
            await this.validateContent(content, metadata);

            // Generate unique storage location
            const location = this.generateStorageLocation();

            // Encrypt content
            const encryptedContent = await this.encryptContent(content);

            // Calculate content hash
            const hash = this.calculateHash(content);

            // Create document content record
            const documentContent: DocumentContent = {
                location: location,
                hash: hash,
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
                size: content.length
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


    public async enforceRetentionPolicy(document: NATODocument): Promise<void> {
        const policy = this.getRetentionPolicy(document.clearance);
        const documentAge = this.calculateDocumentAge(document);
    
        if (documentAge >= policy.retentionPeriod) {
            if (policy.archivalRequired) {
                await this.archiveDocument(document);
            }
            await this.markDocumentForDeletion(document);
            
            this.logger.info('Document marked for deletion per retention policy', {
                documentId: document._id,
                clearance: document.clearance,
                age: documentAge,
                policy: policy
            });
        }
    }
    
    private async markDocumentForDeletion(document: NATODocument): Promise<void> {
        await this.db.updateDocument(document._id as string, {
            metadata: {
                ...document.metadata,
                retentionExpiryDate: new Date(),
                scheduledForDeletion: true
            }
        });
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
        if (content.length > this.STORAGE_CONFIG.MAX_FILE_SIZE) {
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
        // Generate initialization vector
        const iv = crypto.randomBytes(16);

        // Create cipher
        const cipher = crypto.createCipheriv(
            this.STORAGE_CONFIG.ENCRYPTION_ALGORITHM,
            Buffer.from(config.storage.encryptionKey, 'hex'),
            iv,
            { authTagLength: this.STORAGE_CONFIG.AUTH_TAG_LENGTH } as crypto.CipherGCMOptions
        );

        // Encrypt content
        const encrypted = Buffer.concat([
            cipher.update(content),
            cipher.final()
        ]);

        // Get authentication tag
        const authTag = (cipher as crypto.CipherGCM).getAuthTag();

        return { encrypted, iv, authTag };
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
            this.STORAGE_CONFIG.ENCRYPTION_ALGORITHM,
            Buffer.from(config.storage.encryptionKey, 'hex'),
            encryptedData.iv,
            { authTagLength: this.STORAGE_CONFIG.AUTH_TAG_LENGTH } as crypto.CipherGCMOptions
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
    private createStorageError(error: unknown, message: string): AuthError {
        const storageError = new Error(message) as AuthError;
        
        if (error instanceof Error) {
            storageError.statusCode = 500;
            storageError.code = 'STORAGE_ERROR';
            storageError.details = {
                originalError: error.message,
                timestamp: new Date()
            };
        } else {
            storageError.statusCode = 500;
            storageError.code = 'STORAGE_UNKNOWN_ERROR';
            storageError.details = {
                timestamp: new Date()
            };
        }

        return storageError;
    }

    /**
     * Deletes encrypted content from storage location.
     */
    private async deleteEncryptedContent(location: string): Promise<void> {
        // Implementation would depend on your storage backend
        // Could be file system, object storage, etc.
    }

    public async getStorageMetrics(): Promise<{
        contentSizeByClassification: Map<ClearanceLevel, number>;
        totalDocuments: number;
        encryptionStats: typeof DocumentStorageService.prototype.STORAGE_METRICS.encryptionOperations;
    }> {
        try {
            // Update metrics from database
            const documents = await this.db.collection('documents').aggregate([
                {
                    $group: {
                        _id: "$clearance",
                        totalSize: { $sum: "$content.size" },
                        count: { $sum: 1 }
                    }
                }
            ]).toArray();
    
            documents.forEach(doc => {
                this.STORAGE_METRICS.contentSizeByClassification.set(
                    doc._id as ClearanceLevel,
                    doc.totalSize
                );
            });
    
            this.STORAGE_METRICS.totalDocuments = documents.reduce(
                (sum, doc) => sum + doc.count, 0
            );
    
            return {
                contentSizeByClassification: this.STORAGE_METRICS.contentSizeByClassification,
                totalDocuments: this.STORAGE_METRICS.totalDocuments,
                encryptionStats: this.STORAGE_METRICS.encryptionOperations
            };
        } catch (error) {
            this.logger.error('Error getting storage metrics:', error);
            throw this.createStorageError(error, 'Failed to retrieve storage metrics');
        }
    }
    

}

export default DocumentStorageService.getInstance();
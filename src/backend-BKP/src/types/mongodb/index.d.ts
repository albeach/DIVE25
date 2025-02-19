import { ObjectId } from 'mongodb';
const id = new ObjectId();
/**
 * Base interface for all MongoDB documents in the system.
 * Provides common fields that all documents must implement.
 */
export interface MongoDocument {
    _id?: ObjectId;
    metadata: DocumentMetadata;
}

/**
 * Metadata interface tracking document lifecycle and security information.
 * Required for all documents to maintain proper audit trails.
 */
export interface DocumentMetadata {
    createdAt: Date;
    createdBy: string;
    lastModified: Date;
    lastModifiedBy?: string;
    version: number;
    classification: SecurityClassification;
    securityMarkers?: SecurityMarker[];
}

/**
 * NATO security classification levels in order of increasing sensitivity.
 * These align with standard NATO security policies.
 */
export type SecurityClassification =
    | 'UNCLASSIFIED'
    | 'RESTRICTED'
    | 'NATO CONFIDENTIAL'
    | 'NATO SECRET'
    | 'COSMIC TOP SECRET';

/**
 * Security markers for additional access control requirements.
 * These can be combined with classification levels for fine-grained control.
 */
export type SecurityMarker =
    | 'ATOMAL'
    | 'CRYPTOGRAPHIC'
    | 'BOHEMIA'
    | 'BALK'
    | 'NON-NATO';

/**
 * Interface for database collections, providing type-safe operations.
 * Extends MongoDB's native Collection type with NATO-specific functionality.
 */
export interface DatabaseCollection<T extends MongoDocument> {
    findOne(query: any): Promise<T | null>;
    find(query: any): Promise<T[]>;
    insertOne(doc: T): Promise<{ insertedId: ObjectId }>;
    updateOne(query: any, update: any): Promise<{ modifiedCount: number }>;
    deleteOne(query: any): Promise<{ deletedCount: number }>;
}

/**
 * Options for database query operations.
 * Extends MongoDB's native options with NATO-specific settings.
 */
export interface QueryOptions {
    maxTimeMS?: number;
    skip?: number;
    limit?: number;
    sort?: {
        [key: string]: 1 | -1;
    };
    projection?: {
        [key: string]: 1 | 0;
    };
}

/**
 * Options for database update operations.
 * Includes settings for version control and security validation.
 */
export interface UpdateOptions {
    upsert?: boolean;
    bypassValidation?: boolean;
    enforceClassification?: boolean;
    versionControl?: boolean;
}

/**
 * Represents a database filter for querying documents.
 * Provides type-safe filtering based on NATO security attributes.
 */
export interface DocumentFilter<T extends MongoDocument> {
    _id?: ObjectId;
    'metadata.classification'?: SecurityClassification;
    'metadata.securityMarkers'?: SecurityMarker[];
    'metadata.version'?: number;
    [key: string]: any;
}

/**
 * Interface for database indexing configurations.
 * Ensures proper indexing for security-based queries.
 */
export interface IndexConfig {
    key: {
        [key: string]: 1 | -1 | 'text';
    };
    name?: string;
    unique?: boolean;
    sparse?: boolean;
    background?: boolean;
    expireAfterSeconds?: number;
}

/**
 * Interface for database aggregation pipelines.
 * Supports complex queries while maintaining security controls.
 */
export interface AggregationPipeline {
    $match?: DocumentFilter<any>;
    $sort?: { [key: string]: 1 | -1 };
    $limit?: number;
    $skip?: number;
    $project?: { [key: string]: 1 | 0 };
    $group?: any;
    [key: string]: any;
}

/**
 * Result interface for database write operations.
 * Provides detailed information about the operation outcome.
 */
export interface WriteResult {
    acknowledged: boolean;
    modifiedCount?: number;
    deletedCount?: number;
    insertedId?: ObjectId;
    matchedCount?: number;
    upsertedCount?: number;
    upsertedId?: ObjectId;
}

/**
 * Interface for database error handling.
 * Provides structured error information for proper handling.
 */
export interface DatabaseError extends Error {
    code?: string;
    errorLabels?: string[];
    operationTime?: Date;
    resolutionTime?: Date;
    writeConcernError?: any;
    writeErrors?: any[];
}

/**
 * Interface for database session management.
 * Supports transaction handling with proper security context.
 */
export interface DatabaseSession {
    startTransaction(): Promise<void>;
    commitTransaction(): Promise<void>;
    abortTransaction(): Promise<void>;
    endSession(): Promise<void>;
    withTransaction<T>(
        fn: (session: DatabaseSession) => Promise<T>
    ): Promise<T>;
}

/**
 * Interface for database monitoring and metrics.
 * Tracks performance and security-related statistics.
 */
export interface DatabaseMetrics {
    operationCount: number;
    errorCount: number;
    averageResponseTime: number;
    securityViolations: number;
    activeConnections: number;
    queryStatistics: {
        [operationType: string]: {
            count: number;
            averageTime: number;
            errorRate: number;
        };
    };
}

/**
 * Type guard to check if an error is a database error.
 * Helps with proper error handling and typing.
 */
export function isDatabaseError(error: unknown): error is DatabaseError {
    return (
        error instanceof Error &&
        'code' in error &&
        typeof (error as DatabaseError).code === 'string'
    );
}

/**
 * Type guard to check if a document has required security attributes.
 * Ensures documents meet NATO security requirements.
 */
export function hasSecurityAttributes(doc: any): doc is MongoDocument {
    return (
        doc &&
        doc.metadata &&
        typeof doc.metadata.classification === 'string' &&
        (doc.metadata.securityMarkers === undefined ||
            Array.isArray(doc.metadata.securityMarkers))
    );
}
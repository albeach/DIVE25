// src/services/DatabaseService.ts

import { 
  Collection, 
  Db, 
  MongoClient, 
  ObjectId, 
  Document, 
  WithId,
  FindOptions,
  SortDirection,
  IndexDescription 
} from 'mongodb';
import { config } from '../config/config';
import { 
  NATODocument,
  DocumentSearchQuery,
  PaginationOptions,
  SearchResult,
  ValidationResult,
  AuthError,
  DocumentMetadata
} from '../types';
import { LoggerService } from './LoggerService';
import { MetricsService } from './MetricsService';

/**
* Service responsible for all database operations in the NATO document system.
* Implements secure document storage and retrieval with proper auditing and 
* security controls.
*/
export class DatabaseService {
  private static instance: DatabaseService;
  private client: MongoClient;
  private db: Db | null = null;
  private readonly logger: LoggerService;
  private readonly metrics: MetricsService;

  // Collection names as constants to maintain consistency
  private readonly COLLECTIONS = {
      DOCUMENTS: 'documents',
      AUDIT_LOGS: 'audit_logs',
      METADATA: 'metadata'
  };

  private constructor() {
      this.logger = LoggerService.getInstance();
      this.metrics = MetricsService.getInstance();
      
      // Initialize MongoDB client with security-focused configuration
      this.client = new MongoClient(config.mongo.uri, {
          ssl: config.env === 'production',
          retryWrites: true,
          maxPoolSize: 50,
          minPoolSize: 10,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
      });
  }

  public static getInstance(): DatabaseService {
      if (!DatabaseService.instance) {
          DatabaseService.instance = new DatabaseService();
      }
      return DatabaseService.instance;
  }

  /**
   * Establishes database connection and initializes security indexes
   */
  public async connect(): Promise<void> {
      try {
          await this.client.connect();
          // The database name should be configured in your config object
          this.db = this.client.db('dive25');
          
          await this.createIndexes();
          await this.metrics.recordDatabaseConnection('connected');
          
          this.logger.info('Connected to MongoDB', {
              host: config.mongo.uri.split('@')[1]
          });
      } catch (error) {
          this.logger.error('MongoDB connection error:', error);
          await this.metrics.recordDatabaseConnection('failed');
          throw this.createDatabaseError(error, 'Failed to connect to database');
      }
  }

  /**
   * Searches for documents based on query criteria with security filtering
   */
  public async searchDocuments(
      query: DocumentSearchQuery,
      options: PaginationOptions
  ): Promise<SearchResult<NATODocument>> {
      try {
          this.validateConnection();
          
          const collection = this.getCollection<NATODocument>(this.COLLECTIONS.DOCUMENTS);
          const searchQuery = this.buildSearchQuery(query);
          
          const [documents, total] = await Promise.all([
              collection
                  .find(searchQuery)
                  .sort(this.buildSortOptions(options.sort))
                  .skip((options.page - 1) * options.limit)
                  .limit(options.limit)
                  .toArray(),
              collection.countDocuments(searchQuery)
          ]);

          // Return properly typed search result
          return {
              data: documents as NATODocument[],
              total,
              page: options.page,
              limit: options.limit
          };
      } catch (error) {
          this.logger.error('Error searching documents:', error);
          throw this.createDatabaseError(error, 'Failed to search documents');
      }
  }

  /**
   * Creates a new document with security metadata
   */
  public async createDocument(document: Omit<NATODocument, '_id'>): Promise<NATODocument> {
      try {
          this.validateConnection();
          
          const collection = this.getCollection<NATODocument>(this.COLLECTIONS.DOCUMENTS);
          const result = await collection.insertOne(document);
          
          const createdDocument = await this.getDocument(result.insertedId.toString());
          if (!createdDocument) {
              throw new Error('Failed to retrieve created document');
          }

          // Record document creation in audit log
          await this.recordAccess('create', createdDocument._id?.toString() || null);
          return createdDocument;
      } catch (error) {
          this.logger.error('Error creating document:', error);
          throw this.createDatabaseError(error, 'Failed to create document');
      }
  }

  /**
   * Updates document while maintaining security controls and version history
   */
  public async updateDocument(
      id: string,
      update: Partial<NATODocument>
  ): Promise<NATODocument | null> {
      try {
          this.validateConnection();
          
          const collection = this.getCollection<NATODocument>(this.COLLECTIONS.DOCUMENTS);
          const result = await collection.findOneAndUpdate(
              { _id: new ObjectId(id), deleted: { $ne: true } },
              { $set: update },
              { returnDocument: 'after' }
          );

          if (result) {
              await this.recordAccess('update', id);
          }

          return result;
      } catch (error) {
          this.logger.error('Error updating document:', error);
          throw this.createDatabaseError(error, 'Failed to update document');
      }
  }

/**
     * Gets a single document by ID with security metadata
     */
public async getDocument(id: string): Promise<NATODocument | null> {
  try {
      this.validateConnection();
      
      const collection = this.getCollection<NATODocument>(this.COLLECTIONS.DOCUMENTS);
      const document = await collection.findOne({
          _id: new ObjectId(id),
          deleted: { $ne: true }
      });

      if (document) {
          await this.recordAccess('read', id);
      }

      return document;
  } catch (error) {
      this.logger.error('Error retrieving document:', error);
      throw this.createDatabaseError(error, 'Failed to retrieve document');
  }
}

/**
* Counts documents matching search criteria
*/
public async countDocuments(query: DocumentSearchQuery): Promise<number> {
  try {
      this.validateConnection();
      const collection = this.getCollection<NATODocument>(this.COLLECTIONS.DOCUMENTS);
      const searchQuery = this.buildSearchQuery(query);
      return await collection.countDocuments(searchQuery);
  } catch (error) {
      this.logger.error('Error counting documents:', error);
      throw this.createDatabaseError(error, 'Failed to count documents');
  }
}

public async getDocumentVersions(id: string): Promise<DocumentMetadata[]> {
  try {
      this.validateConnection();
      const collection = this.getCollection<DocumentMetadata>(this.COLLECTIONS.METADATA);
      return await collection
          .find({ documentId: new ObjectId(id) })
          .sort({ 'metadata.version': -1 })
          .toArray();
  } catch (error) {
      this.logger.error('Error retrieving document versions:', error);
      throw this.createDatabaseError(error, 'Failed to retrieve document versions');
  }
}

public validateSecurityChanges(
  currentDocument: NATODocument,
  update: Partial<NATODocument>
): void {
  if (update.clearance) {
      const currentLevel = this.getSecurityLevel(currentDocument.clearance);
      const newLevel = this.getSecurityLevel(update.clearance);
      
      if (newLevel < currentLevel) {
          throw new Error('Cannot downgrade document security classification');
      }
  }

  if (update.releasableTo?.length === 0) {
      throw new Error('Document must maintain at least one releasability marker');
  }
}

/**
* Creates required indexes for security and performance
*/
private async createIndexes(): Promise<void> {
  try {
      const collection = this.getCollection<NATODocument>(this.COLLECTIONS.DOCUMENTS);
      
      const indexes: IndexDescription[] = [
          { 
              key: { clearance: 1 },
              name: 'idx_clearance'
          },
          { 
              key: { releasableTo: 1 },
              name: 'idx_releasability'
          },
          { 
              key: { coiTags: 1 },
              name: 'idx_coi_tags'
          },
          { 
              key: { lacvCode: 1 },
              name: 'idx_lacv'
          },
          { 
              key: { 'metadata.createdAt': 1 },
              name: 'idx_created_at'
          },
          { 
              key: { 
                  title: 'text',
                  'metadata.keywords': 'text'
              },
              name: 'idx_text_search'
          }
      ];

      await Promise.all(
          indexes.map(index => collection.createIndex(index.key, {
              name: index.name,
              background: true
          }))
      );

      this.logger.info('Database indexes created successfully');
  } catch (error) {
      this.logger.error('Error creating database indexes:', error);
      throw this.createDatabaseError(error, 'Failed to create indexes');
  }
}

/**
* Records document access in audit trail
*/
private async recordAccess(
  action: string,
  documentId: string | null,
  details?: Record<string, any>
): Promise<void> {
  try {
      const collection = this.getCollection(this.COLLECTIONS.AUDIT_LOGS);
      
      await collection.insertOne({
          documentId: documentId ? new ObjectId(documentId) : null,
          action,
          timestamp: new Date(),
          details
      });
  } catch (error) {
      this.logger.error('Error recording document access:', error);
  }
}

/**
* Validates active database connection
*/
private validateConnection(): void {
  if (!this.db) {
      throw new Error('Database not connected');
  }
}

/**
* Gets typed collection reference
*/
private getCollection<T extends Document>(name: string): Collection<T> {
  if (!this.db) {
      throw new Error('Database not connected');
  }
  return this.db.collection<T>(name);
}

/**
* Builds MongoDB query from search parameters
*/
private buildSearchQuery(query: DocumentSearchQuery): Record<string, any> {
  const searchQuery: Record<string, any> = {
      deleted: { $ne: true }
  };

  if (query.clearance) {
      searchQuery.clearance = query.clearance;
  }

  if (query.releasableTo?.length) {
      searchQuery.releasableTo = { $in: query.releasableTo };
  }

  if (query.coiTags?.length) {
      searchQuery.coiTags = { $all: query.coiTags };
  }

  if (query.lacvCode) {
      searchQuery.lacvCode = query.lacvCode;
  }

  if (query.dateRange) {
      searchQuery['metadata.createdAt'] = {
          $gte: new Date(query.dateRange.start),
          $lte: new Date(query.dateRange.end)
      };
  }

  return searchQuery;
}

/**
* Builds sort options for MongoDB queries
*/
private buildSortOptions(sort?: PaginationOptions['sort']): Record<string, SortDirection> {
  if (!sort) {
      return { 'metadata.createdAt': -1 };
  }

  return { [sort.field]: sort.order === 'desc' ? -1 : 1 };
}

/**
* Creates typed database error
*/
private createDatabaseError(error: unknown, message: string): AuthError {
  const dbError = new Error(message) as AuthError;
  dbError.statusCode = 500;
  dbError.code = 'DB_ERROR';
  dbError.details = {
      originalError: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date()
  };
  return dbError;
}

public async deleteDocument(id: string): Promise<boolean> {
  try {
      this.validateConnection();
      const collection = this.getCollection<NATODocument>(this.COLLECTIONS.DOCUMENTS);
      const result = await collection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { deleted: true } }
      );
      return result.modifiedCount > 0;
  } catch (error) {
      this.logger.error('Error deleting document:', error);
      throw this.createDatabaseError(error, 'Failed to delete document');
  }
}
}

export default DatabaseService.getInstance();
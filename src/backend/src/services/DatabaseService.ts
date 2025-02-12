// src/services/DatabaseService.ts
import { 
  MongoClient, 
  Db, 
  Collection, 
  ObjectId,
  IndexSpecification,
  Document as MongoDocument,
  FindOptions,
  UpdateOptions,
  DeleteOptions
} from 'mongodb';
import { config } from '../config/config';
import { Document } from '../models/Document';
import { LoggerService } from './LoggerService';
import { DocumentSearchQuery, PaginationOptions } from '../types';

export class DatabaseService {
  private static instance: DatabaseService;
  private client: MongoClient;
  private db: Db | null = null;
  private readonly logger: LoggerService;

  private constructor() {
      this.client = new MongoClient(config.mongo.uri);
      this.logger = LoggerService.getInstance();
  }

  public static getInstance(): DatabaseService {
      if (!DatabaseService.instance) {
          DatabaseService.instance = new DatabaseService();
      }
      return DatabaseService.instance;
  }

  async connect(): Promise<void> {
      try {
          await this.client.connect();
          this.db = this.client.db('dive25');
          this.logger.info('Connected to MongoDB');
          await this.createIndexes();
      } catch (error) {
          this.logger.error('MongoDB connection error:', error);
          throw error;
      }
  }

  async disconnect(): Promise<void> {
      try {
          await this.client.close();
          this.logger.info('Disconnected from MongoDB');
      } catch (error) {
          this.logger.error('MongoDB disconnection error:', error);
          throw error;
      }
  }

  private getCollection(): Collection<Document> {
      if (!this.db) {
          throw new Error('Database not connected');
      }
      return this.db.collection<Document>('documents');
  }

  async getDocument(id: string): Promise<Document | null> {
      try {
          if (!ObjectId.isValid(id)) {
              throw new Error('Invalid document ID format');
          }

          const collection = this.getCollection();
          return await collection.findOne({ _id: new ObjectId(id) });
      } catch (error) {
          this.logger.error('Error retrieving document:', error);
          throw error;
      }
  }

  async searchDocuments(
      query: DocumentSearchQuery,
      options: PaginationOptions
  ): Promise<Document[]> {
      try {
          const collection = this.getCollection();
          const searchQuery = this.buildSearchQuery(query);
          
          const {
              page = 1,
              limit = 10,
              sort = { 'metadata.createdAt': -1 }
          } = options;

          return await collection
              .find(searchQuery)
              .sort(sort)
              .skip((page - 1) * limit)
              .limit(limit)
              .toArray();
      } catch (error) {
          this.logger.error('Error searching documents:', error);
          throw error;
      }
  }

  async createDocument(document: Omit<Document, '_id'>): Promise<Document> {
      try {
          const collection = this.getCollection();
          const result = await collection.insertOne(document as Document);
          
          const createdDocument = await this.getDocument(result.insertedId.toString());
          if (!createdDocument) {
              throw new Error('Failed to retrieve created document');
          }

          return createdDocument;
      } catch (error) {
          this.logger.error('Error creating document:', error);
          throw error;
      }
  }

  async updateDocument(
      id: string,
      update: Partial<Document>,
      options: UpdateOptions = {}
  ): Promise<Document | null> {
      try {
          if (!ObjectId.isValid(id)) {
              throw new Error('Invalid document ID format');
          }

          const collection = this.getCollection();
          const result = await collection.findOneAndUpdate(
              { _id: new ObjectId(id) },
              { $set: update },
              { returnDocument: 'after', ...options }
          );

          return result || null;
      } catch (error) {
          this.logger.error('Error updating document:', error);
          throw error;
      }
  }

  async deleteDocument(
      id: string,
      options: DeleteOptions = {}
  ): Promise<boolean> {
      try {
          if (!ObjectId.isValid(id)) {
              throw new Error('Invalid document ID format');
          }

          const collection = this.getCollection();
          const result = await collection.deleteOne(
              { _id: new ObjectId(id) },
              options
          );
          
          return result.deletedCount === 1;
      } catch (error) {
          this.logger.error('Error deleting document:', error);
          throw error;
      }
  }

  async countDocuments(query: DocumentSearchQuery): Promise<number> {
      try {
          const collection = this.getCollection();
          const searchQuery = this.buildSearchQuery(query);
          
          return await collection.countDocuments(searchQuery);
      } catch (error) {
          this.logger.error('Error counting documents:', error);
          throw error;
      }
  }

  private buildSearchQuery(query: DocumentSearchQuery): any {
      const searchQuery: any = {};

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

      if (query.keywords) {
          searchQuery.$text = { $search: query.keywords };
      }

      return searchQuery;
  }

  private async createIndexes(): Promise<void> {
      try {
          const collection = this.getCollection();
          
          const indexes: IndexSpecification[] = [
              { key: { clearance: 1 } },
              { key: { releasableTo: 1 } },
              { key: { coiTags: 1 } },
              { key: { lacvCode: 1 } },
              { key: { 'metadata.createdAt': 1 } },
              { key: { title: 'text', 'metadata.keywords': 'text' } }
          ];

          await Promise.all(
              indexes.map(index => 
                  collection.createIndex(index.key, {
                      background: true,
                      name: Object.keys(index.key).join('_')
                  })
              )
          );

          this.logger.info('Database indexes created successfully');
      } catch (error) {
          this.logger.error('Error creating database indexes:', error);
          throw error;
      }
  }
}

export default DatabaseService;
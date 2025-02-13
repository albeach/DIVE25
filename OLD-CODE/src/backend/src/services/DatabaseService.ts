import { MongoClient, Db, Collection } from 'mongodb';
import { config } from '../config/config';
import { Document } from '../models/Document';

export class DatabaseService {
  private static instance: DatabaseService;
  private client: MongoClient;
  private db: Db | null = null;

  private constructor() {
    this.client = new MongoClient(config.mongo.uri);
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
      console.log('Connected to MongoDB');
    } catch (error) {
      console.error('MongoDB connection error:', error);
      throw error;
    }
  }

  async getDocument(id: string): Promise<Document | null> {
    if (!this.db) throw new Error('Database not connected');
    const collection = this.db.collection<Document>('documents');
    return await collection.findOne({ _id: new ObjectId(id) });
  }

  async searchDocuments(query: any): Promise<Document[]> {
    if (!this.db) throw new Error('Database not connected');
    const collection = this.db.collection<Document>('documents');
    return await collection.find(query).toArray();
  }
}
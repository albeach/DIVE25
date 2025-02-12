// src/services/DatabaseService.ts

import { MongoClient, Db, Collection } from 'mongodb';
import { config } from '../config/config';

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

    getCollection<T>(name: string): Collection<T> {
        if (!this.db) {
            throw new Error('Database not connected');
        }
        return this.db.collection<T>(name);
    }

    async disconnect(): Promise<void> {
        await this.client.close();
    }
}
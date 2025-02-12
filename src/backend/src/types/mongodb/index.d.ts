import { ObjectId } from 'mongodb';

interface MongoDocument {
    _id?: ObjectId;
}

interface DatabaseCollection<T extends MongoDocument> {
    findOne(query: any): Promise<T | null>;
    find(query: any): Promise<T[]>;
    insertOne(doc: T): Promise<any>;
    updateOne(query: any, update: any): Promise<any>;
    deleteOne(query: any): Promise<any>;
}
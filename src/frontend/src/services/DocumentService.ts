import { api } from './api';
import { NATODocument, DocumentSearchQuery, SearchResult } from '../types';

export class DocumentService {
    static async getDocuments(query?: DocumentSearchQuery): Promise<NATODocument[]> {
        const response = await api.get('/documents', { params: query });
        return response.data;
    }

    static async getDocument(id: string): Promise<NATODocument> {
        const response = await api.get(`/documents/${id}`);
        return response.data;
    }

    static async createDocument(document: Partial<NATODocument>): Promise<NATODocument> {
        const response = await api.post('/documents', document);
        return response.data;
    }

    static async updateDocument(id: string, document: Partial<NATODocument>): Promise<NATODocument> {
        const response = await api.put(`/documents/${id}`, document);
        return response.data;
    }

    static async deleteDocument(id: string): Promise<void> {
        await api.delete(`/documents/${id}`);
    }

    static async searchDocuments(query: DocumentSearchQuery): Promise<SearchResult> {
        const response = await api.post('/documents/search', query);
        return response.data;
    }

    static async validateClassification(document: Partial<NATODocument>): Promise<boolean> {
        try {
            await api.post('/documents/validate-classification', document);
            return true;
        } catch {
            return false;
        }
    }
} 
// src/types/pagination.ts
export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
    metadata?: {
        timestamp: Date;
        requestId: string;
    };
}
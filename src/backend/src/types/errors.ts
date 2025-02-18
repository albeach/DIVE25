export class BaseError extends Error {
    constructor(
        message: string,
        public statusCode: number = 500,
        public code: string = 'INTERNAL_ERROR',
        public details?: Record<string, any>
    ) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends BaseError {
    constructor(message: string, details?: Record<string, any>) {
        super(message, 400, 'VALIDATION_ERROR', details);
    }
}

export class AuthenticationError extends BaseError {
    constructor(message: string, details?: Record<string, any>) {
        super(message, 401, 'AUTH_ERROR', details);
    }
}

export class AuthorizationError extends BaseError {
    constructor(message: string, details?: Record<string, any>) {
        super(message, 403, 'FORBIDDEN', details);
    }
}

export class DocumentNotFoundError extends BaseError {
    constructor(documentId: string) {
        super(
            `Document not found: ${documentId}`,
            404,
            'DOCUMENT_NOT_FOUND',
            { documentId }
        );
    }
}

export class SecurityError extends BaseError {
    constructor(message: string, details?: Record<string, any>) {
        super(message, 403, 'SECURITY_ERROR', details);
    }
}

export class DatabaseError extends BaseError {
    constructor(message: string, details?: Record<string, any>) {
        super(message, 500, 'DATABASE_ERROR', details);
    }
}

export class StorageError extends BaseError {
    constructor(message: string, details?: Record<string, any>) {
        super(message, 500, 'STORAGE_ERROR', details);
    }
}

export class OPAError extends BaseError {
    constructor(message: string, details?: Record<string, any>) {
        super(message, 500, 'OPA_ERROR', details);
    }
} 
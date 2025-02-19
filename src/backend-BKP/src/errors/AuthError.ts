export class AuthError extends Error {
    statusCode: number;
    code?: string;
    details?: Record<string, any>;

    constructor(message: string, statusCode: number) {
        super(message);
        this.name = 'AuthError';
        this.statusCode = statusCode;
    }
}
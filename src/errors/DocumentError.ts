export class DocumentError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number = 400) {
        super(message);
        this.name = 'DocumentError';
        this.statusCode = statusCode;
    }
} 
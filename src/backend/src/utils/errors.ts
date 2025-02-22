/// <reference lib="es2022" />

export class ValidationError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ValidationError';
    }
}
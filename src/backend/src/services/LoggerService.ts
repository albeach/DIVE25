// src/services/LoggerService.ts

export class LoggerService {
    private static instance: LoggerService;

    private constructor() {}

    public static getInstance(): LoggerService {
        if (!LoggerService.instance) {
            LoggerService.instance = new LoggerService();
        }
        return LoggerService.instance;
    }

    public info(message: string, meta?: any): void {
        console.info(message, meta);
    }

    public error(message: string, error?: any): void {
        console.error(message, error);
    }

    public warn(message: string, meta?: any): void {
        console.warn(message, meta);
    }
}
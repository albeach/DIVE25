// src/types/winston-mongodb/index.d.ts

declare module 'winston-mongodb' {
    import { TransportStreamOptions } from 'winston-transport';

    interface MongoDBTransportOptions extends TransportStreamOptions {
        db: string;
        collection?: string;
        level?: string;
        options?: any;
        metaKey?: string;
    }

    export class MongoDB {
        constructor(options: MongoDBTransportOptions);
    }
}
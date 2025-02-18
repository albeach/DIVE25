import { App } from './app';
import { config } from './config/config';
import { validateConfig } from './utils/configValidator';
import { LoggerService } from './services/LoggerService';
import { DatabaseService } from './services/DatabaseService';
import { MetricsService } from './services/MetricsService';
import { OPAService } from './services/OPAService';

class Server {
    private readonly logger: LoggerService;
    private readonly db: DatabaseService;
    private readonly metrics: MetricsService;
    private readonly opa: OPAService;
    private readonly app: App;

    constructor() {
        // Initialize core services
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
        this.db = DatabaseService.getInstance();
        this.opa = OPAService.getInstance();
        this.app = new App();
    }

    public async start(): Promise<void> {
        try {
            // Validate configuration
            validateConfig(config);

            // Initialize database connection
            await this.db.connect();

            // Start the server
            const server = this.app.getApp().listen(config.port, () => {
                this.logger.info(`Server started on port ${config.port}`);
                this.metrics.recordOperationMetrics('server_start', {
                    duration: 0,
                    success: true
                });
            });

            // Handle graceful shutdown
            this.setupGracefulShutdown(server);

            // Start health check interval
            this.startHealthChecks();

        } catch (error) {
            this.logger.error('Server failed to start:', error);
            this.metrics.recordOperationError('server_start', error);
            process.exit(1);
        }
    }

    private setupGracefulShutdown(server: any): void {
        const shutdown = async (signal: string) => {
            this.logger.info(`Received ${signal}. Starting graceful shutdown...`);

            // Stop accepting new connections
            server.close(async () => {
                try {
                    // Disconnect from database
                    await this.db.disconnect();

                    this.logger.info('Graceful shutdown completed');
                    process.exit(0);
                } catch (error) {
                    this.logger.error('Error during shutdown:', error);
                    process.exit(1);
                }
            });
        };

        // Handle different shutdown signals
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

        // Handle uncaught errors
        process.on('uncaughtException', (error) => {
            this.logger.error('Uncaught exception:', error);
            this.metrics.recordOperationError('uncaught_exception', error);
            shutdown('uncaughtException');
        });

        process.on('unhandledRejection', (reason) => {
            this.logger.error('Unhandled rejection:', reason);
            this.metrics.recordOperationError('unhandled_rejection', reason as Error);
            shutdown('unhandledRejection');
        });
    }

    private startHealthChecks(): void {
        setInterval(async () => {
            try {
                const dbHealth = await this.db.healthCheck();
                const opaHealth = await this.opa.healthCheck();

                this.metrics.recordOperationMetrics('health_check', {
                    duration: 0,
                    success: dbHealth && opaHealth
                });

                if (!dbHealth || !opaHealth) {
                    this.logger.warn('Health check failed', {
                        database: dbHealth,
                        opa: opaHealth
                    });
                }
            } catch (error) {
                this.logger.error('Health check error:', error);
                this.metrics.recordOperationError('health_check', error);
            }
        }, 30000); // Check every 30 seconds
    }
}

// Start the server
const server = new Server();
server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
}); 
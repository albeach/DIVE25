import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { LoggerService } from './LoggerService';
import { MetricsService } from './MetricsService';
import { config } from '../config/config';

const execAsync = promisify(exec);

export class CertificateManager {
    private static instance: CertificateManager;
    private readonly logger: LoggerService;
    private readonly metrics: MetricsService;

    private constructor() {
        this.logger = LoggerService.getInstance();
        this.metrics = MetricsService.getInstance();
    }

    public static getInstance(): CertificateManager {
        if (!CertificateManager.instance) {
            CertificateManager.instance = new CertificateManager();
        }
        return CertificateManager.instance;
    }

    public async obtainCertificate(): Promise<void> {
        try {
            const { email, domain, staging, certificatePath, privateKeyPath } = config.ssl;

            // Use certbot to obtain certificate
            const stagingFlag = staging ? '--staging' : '';
            const command = `certbot certonly --standalone \
                --non-interactive \
                --agree-tos \
                --email ${email} \
                --domains ${domain} \
                ${stagingFlag} \
                --cert-path ${certificatePath} \
                --key-path ${privateKeyPath}`;

            await execAsync(command);

            this.logger.info('SSL certificate obtained successfully');
            this.metrics.recordOperationMetrics('ssl_certificate_obtain', {
                duration: 0,
                success: true
            });
        } catch (error) {
            this.logger.error('Failed to obtain SSL certificate:', error);
            this.metrics.recordOperationError('ssl_certificate_obtain', error);
            throw error;
        }
    }

    public async renewCertificate(): Promise<void> {
        try {
            await execAsync('certbot renew');
            this.logger.info('SSL certificate renewed successfully');
        } catch (error) {
            this.logger.error('Failed to renew SSL certificate:', error);
            throw error;
        }
    }

    public async setupAutoRenewal(): Promise<void> {
        if (!config.ssl.autoRenew) return;

        // Add to crontab to run every 12 hours
        const command = '0 0,12 * * * certbot renew --quiet';
        await execAsync(`(crontab -l 2>/dev/null; echo "${command}") | crontab -`);
    }
} 
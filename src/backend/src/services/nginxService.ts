import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

export class NginxService {
    private configPath: string;

    constructor() {
        this.configPath = '/etc/nginx/conf.d/partners';
    }

    async addConfig(subdomain: string, config: string): Promise<void> {
        try {
            // Ensure partners directory exists
            await fs.mkdir(this.configPath, { recursive: true });

            // Write partner-specific config
            const configFile = `${this.configPath}/${subdomain}.conf`;
            await fs.writeFile(configFile, config);

            // Test configuration
            await this.testConfig();

            logger.info(`Added NGINX config for ${subdomain}`);
        } catch (error) {
            logger.error('Failed to add NGINX config:', error);
            throw error;
        }
    }

    async removeConfig(subdomain: string): Promise<void> {
        try {
            const configFile = `${this.configPath}/${subdomain}.conf`;
            await fs.unlink(configFile);

            logger.info(`Removed NGINX config for ${subdomain}`);
        } catch (error) {
            logger.error('Failed to remove NGINX config:', error);
            throw error;
        }
    }

    async reload(): Promise<void> {
        try {
            await execAsync('nginx -s reload');
            logger.info('NGINX configuration reloaded');
        } catch (error) {
            logger.error('Failed to reload NGINX:', error);
            throw error;
        }
    }

    private async testConfig(): Promise<void> {
        try {
            await execAsync('nginx -t');
        } catch (error) {
            logger.error('NGINX configuration test failed:', error);
            throw error;
        }
    }
} 
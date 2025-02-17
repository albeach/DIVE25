import { CloudflareAPI } from 'cloudflare';
import { logger } from '../utils/logger';

interface DNSRecord {
    name: string;
    type: 'A' | 'CNAME';
    content: string;
    proxied: boolean;
}

export class CloudflareService {
    private client: CloudflareAPI;
    private zoneId: string;

    constructor() {
        this.client = new CloudflareAPI({
            token: process.env.CLOUDFLARE_API_TOKEN
        });
        this.zoneId = process.env.CLOUDFLARE_ZONE_ID as string;
    }

    async createSubdomain(record: DNSRecord): Promise<void> {
        try {
            await this.client.dnsRecords.create(this.zoneId, {
                name: `${record.name}.dive25.com`,
                type: record.type,
                content: record.content,
                proxied: record.proxied
            });

            logger.info(`Created DNS record for ${record.name}.dive25.com`);
        } catch (error) {
            logger.error('Failed to create DNS record:', error);
            throw error;
        }
    }

    async removeSubdomain(subdomain: string): Promise<void> {
        try {
            // Find the record ID
            const records = await this.client.dnsRecords.browse(this.zoneId);
            const record = records.result.find(r =>
                r.name === `${subdomain}.dive25.com`
            );

            if (record) {
                await this.client.dnsRecords.delete(this.zoneId, record.id);
                logger.info(`Removed DNS record for ${subdomain}.dive25.com`);
            }
        } catch (error) {
            logger.error('Failed to remove DNS record:', error);
            throw error;
        }
    }
} 
import { Partner } from '@prisma/client';
import { CloudflareService } from './cloudflareService';
import { NginxService } from './nginxService';
import { logger } from '../utils/logger';

export class PartnerDomainService {
    private cloudflare: CloudflareService;
    private nginx: NginxService;

    constructor() {
        this.cloudflare = new CloudflareService();
        this.nginx = new NginxService();
    }

    async setupPartnerDomain(partner: Partner): Promise<void> {
        try {
            const subdomain = this.generateSubdomain(partner);

            // Create DNS record
            await this.cloudflare.createSubdomain({
                name: subdomain,
                type: 'A',
                content: process.env.LOAD_BALANCER_IP as string,
                proxied: true
            });

            // Generate nginx config for the partner
            const nginxConfig = this.generateNginxConfig(partner, subdomain);
            await this.nginx.addConfig(subdomain, nginxConfig);

            // Reload nginx to apply changes
            await this.nginx.reload();

            logger.info(`Partner domain setup complete: ${subdomain}.dive25.com`);
        } catch (error) {
            logger.error('Failed to setup partner domain:', error);
            throw error;
        }
    }

    async removePartnerDomain(partner: Partner): Promise<void> {
        try {
            const subdomain = this.generateSubdomain(partner);

            // Remove DNS record
            await this.cloudflare.removeSubdomain(subdomain);

            // Remove nginx config
            await this.nginx.removeConfig(subdomain);

            // Reload nginx to apply changes
            await this.nginx.reload();

            logger.info(`Partner domain removed: ${subdomain}.dive25.com`);
        } catch (error) {
            logger.error('Failed to remove partner domain:', error);
            throw error;
        }
    }

    private generateSubdomain(partner: Partner): string {
        // Convert partner name to URL-safe format
        return partner.name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    private generateNginxConfig(partner: Partner, subdomain: string): string {
        return `
server {
    listen 443 ssl http2;
    server_name ${subdomain}.dive25.com;

    ssl_certificate /etc/letsencrypt/live/dive25.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dive25.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-XSS-Protection "1; mode=block";
    add_header X-Content-Type-Options "nosniff";

    # Partner-specific configuration
    location / {
        proxy_pass ${partner.idpEndpoint};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Partner-specific headers
        proxy_set_header X-Partner-ID "${partner.id}";
        proxy_set_header X-Partner-Name "${partner.name}";
        proxy_set_header X-Clearance-Level "${partner.clearanceLevel}";
    }

    # Health check endpoint
    location /health {
        return 200 'healthy\n';
        add_header Content-Type text/plain;
    }
}
    `;
    }
} 
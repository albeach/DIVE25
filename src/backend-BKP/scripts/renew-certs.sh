#!/bin/bash

# Exit on any error
set -e

DOMAIN=${DOMAIN:-"your-domain.com"}
EMAIL=${SSL_EMAIL:-"admin@your-domain.com"}

echo "Starting certificate renewal process for $DOMAIN..."

# Stop nginx temporarily
docker-compose stop nginx

# Attempt renewal
certbot renew --non-interactive --agree-tos --email "$EMAIL"

# Start nginx again
docker-compose start nginx

# Check certificate expiry
CERT_EXPIRY=$(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/$DOMAIN/fullchain.pem")
echo "Certificate status: $CERT_EXPIRY"

# Notify metrics
curl -X POST http://localhost:3000/api/metrics/certificate-renewal \
    -H "Content-Type: application/json" \
    -d "{\"domain\": \"$DOMAIN\", \"renewalDate\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\"}"

echo "Certificate renewal process completed" 
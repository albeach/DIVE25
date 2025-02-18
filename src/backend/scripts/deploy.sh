#!/bin/bash

set -e

ENV=${1:-production}
DOMAIN=${DOMAIN:-"your-domain.com"}

echo "Deploying NATO Document Management System to $ENV..."

# Load environment variables
source .env.$ENV

# Verify prerequisites
for cmd in docker docker-compose certbot openssl; do
    if ! command -v $cmd &> /dev/null; then
        echo "Error: $cmd is required but not installed."
        exit 1
    fi
done

# Setup SSL certificates
if [ "$ENV" = "production" ]; then
    echo "Setting up SSL certificates..."
    
    # Create certificate directory
    mkdir -p /etc/letsencrypt
    
    # Check existing certificate
    if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
        echo "Obtaining new SSL certificate..."
        ./scripts/setup-certs.sh
    else
        echo "Checking certificate expiry..."
        EXPIRY=$(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/$DOMAIN/fullchain.pem")
        echo "Current certificate expires: $EXPIRY"
    fi
fi

# Deploy services
echo "Deploying services..."
docker-compose -f docker-compose.$ENV.yml up -d

# Wait for services to be healthy
echo "Waiting for services to be healthy..."
./scripts/health-check.sh

echo "Deployment completed successfully!" 
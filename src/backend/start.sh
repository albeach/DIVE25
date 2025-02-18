#!/bin/bash

# Exit on any error
set -e

# Parse command line arguments
ENV=${1:-production}  # Default to production if no argument provided

echo "Starting NATO Document Management System in $ENV mode..."

# Check Docker
if ! docker info > /dev/null 2>&1; then
    echo "Docker is not running. Please start Docker and try again."
    exit 1
fi

# SSL Certificate setup for production
if [ "$ENV" = "production" ]; then
    echo "Checking SSL certificates..."
    
    # Install certbot if not present
    if ! command -v certbot &> /dev/null; then
        echo "Installing certbot..."
        apt-get update && apt-get install -y certbot
    fi
    
    # Check for existing certificates
    if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
        echo "Obtaining SSL certificate..."
        certbot certonly --standalone \
            --non-interactive \
            --agree-tos \
            --email "${SSL_EMAIL}" \
            --domains "${DOMAIN}" \
            --cert-path "${SSL_CERT_PATH}" \
            --key-path "${SSL_KEY_PATH}"
    fi
    
    # Setup auto-renewal
    (crontab -l 2>/dev/null; echo "0 0,12 * * * certbot renew --quiet") | crontab -
fi

# Choose compose file based on environment
if [ "$ENV" = "development" ]; then
    echo "Starting in development mode..."
    docker-compose -f docker-compose.yml up -d mongodb opa prometheus grafana
    npm install
    npm run dev
else
    echo "Starting in production mode..."
    docker-compose -f docker-compose.prod.yml up -d
fi

# Wait for services
echo "Waiting for services to be ready..."
sleep 10

# Check MongoDB
if ! docker-compose exec mongodb mongosh --eval "db.adminCommand('ping')" > /dev/null; then
    echo "MongoDB failed to start properly"
    exit 1
fi

# Check OPA
if ! curl -s http://localhost:8181/health > /dev/null; then
    echo "OPA failed to start properly"
    exit 1
fi

echo "Services are healthy!"
echo "API is running at http://localhost:3000"
echo "Grafana dashboard at http://localhost:3002"
echo "Prometheus metrics at http://localhost:9090"

# Print logs
echo "Recent logs:"
docker-compose logs --tail=50

echo "Setup complete! Use 'docker-compose logs -f' to follow logs" 
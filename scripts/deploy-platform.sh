#!/bin/bash

# Exit on error
set -e

# Load environment variables
if [ -f .env ]; then
    source .env
else
    echo "Error: .env file not found"
    exit 1
fi

# Check environment
if [ "$NODE_ENV" != "production" ]; then
    echo "Warning: Not in production environment"
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Functions
check_requirements() {
    echo "Checking requirements..."
    command -v docker >/dev/null 2>&1 || { echo "Docker is required but not installed. Aborting." >&2; exit 1; }
    command -v docker-compose >/dev/null 2>&1 || { echo "Docker Compose is required but not installed. Aborting." >&2; exit 1; }
    command -v openssl >/dev/null 2>&1 || { echo "OpenSSL is required but not installed. Aborting." >&2; exit 1; }
}

setup_ssl() {
    echo "Setting up SSL certificates..."
    ./scripts/setup-ssl.sh
}

deploy_platform() {
    echo "Deploying DIVE25 platform..."

    # Build and deploy
    docker-compose -f docker-compose.prod.yml down
    docker-compose -f docker-compose.prod.yml build
    docker-compose -f docker-compose.prod.yml up -d

    # Wait for services
    echo "Waiting for services to start..."
    sleep 10

    # Health check
    if curl -f "https://api.dive25.com/health" >/dev/null 2>&1; then
        echo "Deployment successful!"
    else
        echo "Warning: Health check failed. Please check logs."
    fi
}

# Main execution
echo "Starting DIVE25 platform deployment..."

check_requirements
setup_ssl
deploy_platform

echo "Deployment complete. Check logs with: docker-compose -f docker-compose.prod.yml logs -f" 
#!/bin/bash

# Exit on error
set -e

# Load environment variables
source .env

# Build and push Docker images
docker-compose -f docker-compose.prod.yml build

# Deploy to server
ssh dive25@dive25.com << 'ENDSSH'
    # Pull latest code
    cd /opt/dive25
    git pull

    # Load environment variables
    source .env

    # Stop and remove existing containers
    docker-compose -f docker-compose.prod.yml down

    # Start new containers
    docker-compose -f docker-compose.prod.yml up -d

    # Run database migrations
    docker-compose -f docker-compose.prod.yml exec api npm run migrate

    # Check services health
    docker-compose -f docker-compose.prod.yml ps
ENDSSH
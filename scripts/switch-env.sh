#!/bin/bash

# Exit on error
set -e

# Check if environment argument is provided
if [ -z "$1" ]; then
    echo "Usage: ./switch-env.sh [dev|prod]"
    exit 1
fi

# Switch environment
case "$1" in
    dev)
        echo "Switching to development environment..."
        export NODE_ENV=development
        docker-compose -f docker-compose.dev.yml up -d
        ;;
    prod)
        echo "Switching to production environment..."
        export NODE_ENV=production
        ./scripts/setup-ssl.sh
        docker-compose -f docker-compose.prod.yml up -d
        ;;
    *)
        echo "Invalid environment. Use 'dev' or 'prod'"
        exit 1
        ;;
esac

# Wait for services to be ready
echo "Waiting for services to be ready..."
sleep 5

# Check services health
docker-compose -f docker-compose.$1.yml ps

echo "Environment switched to $1" 
#!/bin/bash

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Set project root
export PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Load base environment variables
if [ -f "docker/.env" ]; then
    export $(cat docker/.env | grep -v '^#' | xargs)
fi

# Verify structure
if ! ./docker/verify-structure.sh; then
    echo -e "${RED}Project structure verification failed${NC}"
    exit 1
fi

# Environment selection
echo -e "${GREEN}DIVE25 Deployment Script${NC}"
echo "1) Development"
echo "2) Staging"
echo "3) Production"
read -p "Select environment [1-3]: " env_choice

case $env_choice in
    1)
        env="dev"
        export NODE_ENV=development
        ;;
    2)
        env="staging"
        export NODE_ENV=staging
        ;;
    3)
        env="prod"
        export NODE_ENV=production
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

# Load environment-specific variables
if [ -f "docker/.env.${env}" ]; then
    export $(cat "docker/.env.${env}" | grep -v '^#' | xargs)
fi

# Start services
echo -e "${GREEN}Starting $env environment...${NC}"
docker compose -f docker/docker-compose.yml -f docker/docker-compose.$env.yml up -d

echo -e "${GREEN}Services started!${NC}" 
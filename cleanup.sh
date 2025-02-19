#!/bin/bash

# Color codes
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}Reorganizing Docker files...${NC}"

# Create docker directory structure
mkdir -p docker/config/nginx/conf.d

# Move docker-compose files
mv src/backend/docker-compose*.yml docker/
mv docker-compose*.yml docker/ 2>/dev/null  # In case files are in root

# Move environment files
mv src/backend/.env* docker/
mv .env* docker/ 2>/dev/null  # In case files are in root

# Move nginx configuration
mv src/backend/nginx/conf.d/* docker/config/nginx/conf.d/ 2>/dev/null
mv nginx/conf.d/* docker/config/nginx/conf.d/ 2>/dev/null

# Clean up empty directories
rm -rf src/backend/nginx 2>/dev/null
rm -rf nginx 2>/dev/null

echo -e "${GREEN}Files moved successfully!${NC}"
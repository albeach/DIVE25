#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Cleaning up DIVE25 directory structure...${NC}"

# Remove duplicate start.sh from backend
if [ -f "src/backend/start.sh" ]; then
    rm src/backend/start.sh
    echo "Removed duplicate start.sh from src/backend/"
fi

# Ensure correct directory structure
mkdir -p src/backend
mkdir -p src/frontend
mkdir -p certificates/prod

# Move any misplaced files to correct locations
if [ -f "backend/docker-compose.staging.yml" ]; then
    mv backend/docker-compose.staging.yml src/backend/
fi

if [ -f "backend/.env.staging" ]; then
    mv backend/.env.staging src/backend/
fi

# Remove empty old directories
rm -rf backend 2>/dev/null
rm -rf frontend 2>/dev/null

echo -e "${GREEN}Directory structure cleaned up!${NC}" 
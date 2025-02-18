#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Verifying DIVE25 directory structure...${NC}"

# Check required files and directories
required_paths=(
    "start.sh"
    "README.md"
    "certificates/prod"
    "src/backend"
    "src/frontend"
    "src/backend/docker-compose.staging.yml"
)

for path in "${required_paths[@]}"; do
    if [ -e "$path" ]; then
        echo -e "${GREEN}✓${NC} Found: $path"
    else
        echo -e "${RED}✗${NC} Missing: $path"
    fi
done 
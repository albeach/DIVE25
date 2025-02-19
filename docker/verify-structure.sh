#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Verifying DIVE25 directory structure...${NC}"

# Essential files only
required_files=(
    "src/frontend/Dockerfile"
    "src/backend/Dockerfile"
    "src/frontend/package.json"
    "src/backend/package.json"
    "docker/docker-compose.yml"
    "docker/docker-compose.dev.yml"
    "docker/docker-compose.staging.yml"
    "docker/docker-compose.prod.yml"
)

# Track if any errors found
errors_found=0

echo "Verifying project structure..."

# Check each required path
for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} Found: $file"
    else
        echo -e "${RED}✗${NC} Missing: $file"
        errors_found=1
    fi
done

# Check directory permissions
echo -e "\n${YELLOW}Checking directory permissions...${NC}"
directories=("docker" "src/backend" "src/frontend")
for dir in "${directories[@]}"; do
    if [ -d "$dir" ]; then
        permissions=$(stat -f "%Lp" "$dir")
        if [[ $permissions =~ ^[0-7][0-7][0-7]$ ]]; then
            echo -e "${GREEN}✓${NC} $dir permissions: $permissions"
        else
            echo -e "${RED}✗${NC} $dir has incorrect permissions: $permissions"
            errors_found=1
        fi
    fi
done

# Check Docker context paths
echo -e "\n${YELLOW}Verifying Docker context paths...${NC}"
for compose_file in docker/docker-compose*.yml; do
    if [ -f "$compose_file" ]; then
        if grep -q "build: ../src/" "$compose_file"; then
            echo -e "${GREEN}✓${NC} $compose_file has correct context paths"
        else
            echo -e "${RED}✗${NC} $compose_file might have incorrect context paths"
            errors_found=1
        fi
    fi
done

# Exit with status
if [ $errors_found -eq 0 ]; then
    echo -e "\n${GREEN}All checks passed!${NC}"
    exit 0
else
    echo -e "\n${RED}Some checks failed. Please fix the issues above.${NC}"
    exit 1
fi

# Make the script executable
chmod +x docker/verify-structure.sh 
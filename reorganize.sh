#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Starting DIVE25 project reorganization...${NC}"

# Create base directory structure
mkdir -p src/{backend,frontend}/certificates/prod

echo -e "${YELLOW}Creating directory structure...${NC}"
# Create necessary subdirectories
mkdir -p src/backend/{config,scripts,tests,services,middleware}
mkdir -p src/frontend/{src,public,components}

# Move existing files to their new locations
echo -e "${YELLOW}Moving backend files...${NC}"
if [ -d "backend" ]; then
    mv backend/* src/backend/ 2>/dev/null || true
fi

echo -e "${YELLOW}Moving frontend files...${NC}"
if [ -d "frontend" ]; then
    mv frontend/* src/frontend/ 2>/dev/null || true
fi

# Move configuration files
echo -e "${YELLOW}Moving configuration files...${NC}"
mv .env* src/backend/ 2>/dev/null || true
mv docker-compose* src/backend/ 2>/dev/null || true
mv Dockerfile src/backend/ 2>/dev/null || true

# Ensure start.sh is in the right place and executable
echo -e "${YELLOW}Setting up start script...${NC}"
if [ -f "start.sh" ]; then
    mv start.sh src/backend/
    chmod +x src/backend/start.sh
fi

# Documentation stays in root (no move needed)
echo -e "${YELLOW}Verifying documentation in root...${NC}"
touch README.md START.md

# Update paths in configuration files
echo -e "${YELLOW}Updating configuration paths...${NC}"
find src/backend -type f -name "*.yml" -exec sed -i 's/\.\.\/certificates/\.\/certificates/g' {} +
find src/backend -type f -name "*.env*" -exec sed -i 's/\.\.\/certificates/\.\/certificates/g' {} +

# Create .gitignore in root
cat > .gitignore << EOL
# Dependencies
node_modules/
dist/

# Environment
.env*
!.env.example

# Certificates
src/backend/certificates/prod/*
!src/backend/certificates/prod/.gitkeep

# Logs
*.log
logs/

# Build output
build/
dist/

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db
EOL

# Create empty files to maintain directory structure
touch src/backend/certificates/prod/.gitkeep

# Display new structure
echo -e "${GREEN}Displaying new directory structure:${NC}"
tree -L 3 -a

echo -e "${GREEN}Reorganization complete!${NC}"
echo -e "${YELLOW}Please verify all files are in their correct locations.${NC}"

# Create verification instructions
cat > VERIFY.md << EOL
# Verification Steps

1. Check directory structure:
   \`\`\`
   tree -L 3
   \`\`\`

2. Verify start script:
   \`\`\`
   cd src/backend
   ./start.sh
   \`\`\`

3. Check configuration files:
   \`\`\`
   ls src/backend/.env*
   ls src/backend/docker-compose*
   \`\`\`

4. Verify certificates directory:
   \`\`\`
   ls src/backend/certificates/prod
   \`\`\`

5. Verify documentation in root:
   \`\`\`
   ls *.md
   \`\`\`
EOL

echo -e "${GREEN}Created VERIFY.md with verification instructions${NC}" 
#!/bin/bash

echo "DIVE25 Setup"
echo "==========="

# Error handling
set -e  # Exit on any error
trap cleanup EXIT  # Run cleanup on script exit

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Cleanup function
cleanup() {
    if [ $? -ne 0 ]; then
        echo -e "${RED}Setup failed! Cleaning up...${NC}"
        
        echo "Stopping Docker containers..."
        docker-compose down 2>/dev/null || echo "Warning: Could not stop Docker containers"
        
        echo "Removing node_modules..."
        rm -rf node_modules 2>/dev/null || echo "Warning: Could not remove node_modules"
        
        echo "Removing dist directory..."
        rm -rf dist 2>/dev/null || echo "Warning: Could not remove dist directory"
        
        echo "Removing environment files..."
        rm -f .env* 2>/dev/null || echo "Warning: Could not remove environment files"
        
        echo -e "${YELLOW}Cleanup completed. Check the error messages above and:"
        echo "1. Ensure you have necessary permissions"
        echo "2. Check if Docker is running"
        echo "3. Verify your npm installation"
        echo "4. Make sure no processes are locking the files${NC}"
    fi
}

# Error logging function with specific contexts
log_error() {
    local context=$1
    local message=$2
    local help=$3
    echo -e "${RED}Error during ${context}: ${message}${NC}"
    if [ ! -z "$help" ]; then
        echo -e "${YELLOW}Suggestion: ${help}${NC}"
    fi
    exit 1
}

# Success logging function
log_success() {
    echo -e "${GREEN}Success: $1${NC}"
}

# Function to check and fix TypeScript installation
check_typescript() {
    echo "Checking TypeScript installation..."
    if [ -d "node_modules/typescript" ]; then
        echo "Removing existing TypeScript installation..."
        rm -rf node_modules/typescript || log_error "TypeScript removal" \
            "Could not remove existing TypeScript installation" \
            "Check if you have write permissions and no processes are using TypeScript"
    fi
    echo "Installing TypeScript 4.9.5..."
    npm install typescript@4.9.5 --save-dev || log_error "TypeScript installation" \
        "Failed to install TypeScript 4.9.5" \
        "Check your npm registry access and internet connection"
    
    # Verify TypeScript installation
    if ! npx tsc --version | grep -q "Version 4.9.5"; then
        log_error "TypeScript verification" \
            "TypeScript 4.9.5 not properly installed" \
            "Try clearing npm cache with 'npm cache clean --force'"
    fi
    log_success "TypeScript 4.9.5 installed and verified"
}

# Function to install required type definitions
install_types() {
    echo "Installing type definitions..."
    local types=(
        "@types/mongoose"
        "@types/node"
        "@types/express"
        "@types/swagger-jsdoc"
        "@types/swagger-ui-express"
        "@types/joi"
    )
    
    for type in "${types[@]}"; do
        echo "Installing $type..."
        npm install --save-dev "$type" || log_error "Type definition installation" \
            "Failed to install $type" \
            "Check if the package exists and you have internet access"
    done
    log_success "All type definitions installed"
}

# Function to install core dependencies
install_dependencies() {
    echo "Installing core dependencies..."
    local deps=(
        "mongoose"
        "@prisma/client"
        "joi"
        "swagger-jsdoc"
        "swagger-ui-express"
    )
    
    for dep in "${deps[@]}"; do
        echo "Installing $dep..."
        npm install "$dep" || log_error "Dependency installation" \
            "Failed to install $dep" \
            "Check your npm registry access and internet connection"
    done
    log_success "All core dependencies installed"
}

# Function to generate Prisma types
generate_prisma_types() {
    echo "Generating Prisma types..."
    if [ ! -f "prisma/schema.prisma" ]; then
        log_error "Prisma generation" \
            "Prisma schema not found at prisma/schema.prisma" \
            "Ensure you have initialized Prisma with 'npx prisma init'"
    fi
    
    # Check if Prisma client is installed
    if [ ! -d "node_modules/@prisma/client" ]; then
        log_error "Prisma generation" \
            "Prisma client not installed" \
            "Run 'npm install @prisma/client' first"
    fi
    
    npx prisma generate || log_error "Prisma generation" \
        "Failed to generate Prisma types" \
        "Check your Prisma schema for errors"
    log_success "Prisma types generated successfully"
}

# Function to verify npm and node installation
verify_npm() {
    echo "Verifying npm and Node.js installation..."
    
    # Check node
    if ! command -v node &> /dev/null; then
        log_error "Environment verification" \
            "Node.js is not installed" \
            "Install Node.js from https://nodejs.org (version 14 or higher recommended)"
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "Environment verification" \
            "npm is not installed" \
            "npm should be installed with Node.js. Try reinstalling Node.js"
    fi
    
    # Check versions
    node_version=$(node -v | cut -d 'v' -f 2)
    npm_version=$(npm -v)
    
    if [ "$(printf '%s\n' "14.0.0" "$node_version" | sort -V | head -n1)" = "14.0.0" ]; then
        log_success "Node.js version $node_version is compatible"
    else
        log_error "Environment verification" \
            "Node.js version $node_version is not compatible" \
            "Please install Node.js version 14.0.0 or higher"
    fi
    
    if [ "$(printf '%s\n' "6.0.0" "$npm_version" | sort -V | head -n1)" = "6.0.0" ]; then
        log_success "npm version $npm_version is compatible"
    else
        log_error "Environment verification" \
            "npm version $npm_version is not compatible" \
            "Please install npm version 6.0.0 or higher"
    fi
}

# Function to create Docker Compose override files
create_docker_compose_files() {
    echo "Creating Docker Compose configuration files..."
    
    # Base docker-compose.yml (minimal configuration)
    cat > docker-compose.yml << EOL
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - /app/node_modules
EOL
    log_success "Created base docker-compose.yml"

    # Development override
    cat > docker-compose.dev.yml << EOL
version: '3.8'

services:
  db:
    image: postgres:13-alpine
    environment:
      POSTGRES_USER: \${DB_USER}
      POSTGRES_PASSWORD: \${DB_PASSWORD}
      POSTGRES_DB: \${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${DB_USER}"]
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://\${DB_USER}:\${DB_PASSWORD}@db:5432/\${DB_NAME}
    depends_on:
      db:
        condition: service_healthy

volumes:
  postgres_data:
EOL
    log_success "Created docker-compose.dev.yml"

    # Staging override
    cat > docker-compose.staging.yml << EOL
version: '3.8'

services:
  db:
    image: postgres:13-alpine
    environment:
      POSTGRES_USER: \${DB_USER}
      POSTGRES_PASSWORD: \${DB_PASSWORD}
      POSTGRES_DB: \${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 3

  redis:
    image: redis:alpine
    volumes:
      - redis_data:/data

  api:
    environment:
      - NODE_ENV=staging
      - DATABASE_URL=postgresql://\${DB_USER}:\${DB_PASSWORD}@db:5432/\${DB_NAME}
      - REDIS_URL=redis://redis:6379
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started

volumes:
  postgres_data:
  redis_data:
EOL
    log_success "Created docker-compose.staging.yml"

    # Production override
    cat > docker-compose.prod.yml << EOL
version: '3.8'

services:
  db:
    image: postgres:13-alpine
    environment:
      POSTGRES_USER: \${DB_USER}
      POSTGRES_PASSWORD: \${DB_PASSWORD}
      POSTGRES_DB: \${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${DB_USER}"]
      interval: 30s
      timeout: 10s
      retries: 5
    deploy:
      resources:
        limits:
          memory: 1G

  redis:
    image: redis:alpine
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    deploy:
      resources:
        limits:
          memory: 512M

  api:
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://\${DB_USER}:\${DB_PASSWORD}@db:5432/\${DB_NAME}
      - REDIS_URL=redis://redis:6379
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 1G
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started

volumes:
  postgres_data:
  redis_data:
EOL
    log_success "Created docker-compose.prod.yml"
}

# Modify the Docker startup in main()
start_docker_services() {
    local env=${1:-dev}
    echo "Starting Docker services in ${env} environment..."
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker verification" \
            "docker-compose is not installed" \
            "Install Docker Desktop from https://www.docker.com/products/docker-desktop"
    fi
    
    case $env in
        dev)
            docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
            ;;
        staging)
            docker-compose -f docker-compose.yml -f docker-compose.staging.yml up -d
            ;;
        prod)
            docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
            ;;
        *)
            log_error "Environment selection" \
                "Invalid environment: ${env}" \
                "Use one of: dev, staging, prod"
            ;;
    esac
}

# Modify main() to include these changes
main() {
    echo "Starting setup process..."
    
    verify_npm
    
    echo "Generating secure passwords..."
    # ... existing password generation code ...
    
    echo "Creating directories..."
    for dir in logs data config; do
        mkdir -p $dir || log_error "Directory creation" \
            "Failed to create directory: $dir" \
            "Check if you have write permissions in the current directory"
    done
    
    echo "Creating environment files..."
    # ... existing env file creation code ...
    
    echo "Installing npm dependencies..."
    npm install || log_error "npm installation" \
        "Failed to install npm dependencies" \
        "Try running 'npm cache clean --force' and retry"
    
    # TypeScript and dependency setup
    check_typescript
    install_types
    install_dependencies
    generate_prisma_types
    
    echo "Starting Docker services..."
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker verification" \
            "docker-compose is not installed" \
            "Install Docker Desktop from https://www.docker.com/products/docker-desktop"
    fi
    
    docker-compose up -d || log_error "Docker startup" \
        "Failed to start Docker services" \
        "Check if Docker is running and you have necessary permissions"
    
    # First remove potentially vulnerable packages
    npm uninstall swagger-jsdoc swagger-ui-express

    # Install more secure API documentation alternatives
    npm install --save fastify-swagger @fastify/swagger-ui

    # Update core dependencies to latest secure versions
    npm install --save express@latest
    npm install --save mongoose@latest
    npm install --save @prisma/client@latest

    # Install security-focused middleware
    npm install --save 
      helmet@latest          # Security headers
      express-rate-limit    # Rate limiting
      express-validator     # Input validation
      cors                  # CORS handling
      
    # Install their type definitions
    npm install --save-dev
      @types/helmet
      @types/express-rate-limit
      @types/cors
    
    log_success "Setup completed successfully!"
    echo "The application is now running at http://localhost:3000"
}

# Run main setup
main 
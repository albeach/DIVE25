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

# Main setup process
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
    
    log_success "Setup completed successfully!"
    echo "The application is now running at http://localhost:3000"
}

# Run main setup
main 
#!/bin/bash

set -e

# Get the project root directory
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$PROJECT_ROOT"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to generate random passwords
generate_password() {
    openssl rand -base64 32
}

# Function to create environment file
create_env_file() {
    local env_type=$1
    local env_file="${PROJECT_ROOT}/src/backend/.env.${env_type}"
    
    # Generate secure passwords
    local DB_PASS=$(generate_password)
    local REDIS_PASS=$(generate_password)
    local JWT_SECRET=$(generate_password)
    local API_KEY=$(generate_password)

    echo "Creating ${env_type} environment file..."

    case $env_type in
        "development")
            read -p "Enter MongoDB URI [mongodb://localhost:27017/dive25]: " MONGODB_URI
            MONGODB_URI=${MONGODB_URI:-mongodb://localhost:27017/dive25}
            read -p "Enter Redis host [localhost]: " REDIS_HOST
            REDIS_HOST=${REDIS_HOST:-localhost}
            read -p "Enter API port [3000]: " API_PORT
            API_PORT=${API_PORT:-3000}
            ;;
            
        "staging")
            MONGODB_URI="mongodb://dive25_test:${DB_PASS}@mongodb:27017/dive25_test"
            REDIS_HOST="redis"
            API_PORT="3000"
            ;;
            
        "production")
            read -p "Enter domain name: " DOMAIN
            read -p "Enter SSL email: " SSL_EMAIL
            MONGODB_URI="mongodb://dive25_prod:${DB_PASS}@mongodb:27017/dive25_prod"
            REDIS_HOST="redis"
            API_PORT="3000"
            ;;
    esac

    # Create environment file
    mkdir -p $(dirname "$env_file")
    cat > "$env_file" << EOL
# Environment: ${env_type}
# Generated: $(date)

# Core Configuration
NODE_ENV=${env_type}
API_PORT=${API_PORT}
DOMAIN=${DOMAIN:-localhost}
SSL_EMAIL=${SSL_EMAIL:-""}

# Database Configuration
MONGODB_URI=${MONGODB_URI}
DB_PASSWORD=${DB_PASS}

# Redis Configuration
REDIS_HOST=${REDIS_HOST}
REDIS_PASSWORD=${REDIS_PASS}

# Security
JWT_SECRET=${JWT_SECRET}
API_KEY=${API_KEY}
EOL

    echo -e "${GREEN}Created ${env_file}${NC}"
}

# Main script
echo -e "${GREEN}DIVE25 Deployment Script${NC}"
echo "1) Development (Custom configuration)"
echo "2) Staging (Test environment with sample data)"
echo "3) Production (Secure production setup)"
echo -n "Select deployment type [1-3]: "
read -r choice

case $choice in
    2) # Staging
        ENV="staging"
        echo -e "${GREEN}Starting Staging Environment...${NC}"
        
        # Create staging environment file
        create_env_file "staging"
        
        # Check for existing certificates in project root
        CERT_DIR="${PROJECT_ROOT}/certificates/prod"
        if [ -f "${CERT_DIR}/fullchain.pem" ] && [ -f "${CERT_DIR}/privkey.pem" ]; then
            echo -e "${GREEN}Found existing SSL certificates in ${CERT_DIR}${NC}"
            
            # Ensure nginx certs directory exists
            sudo mkdir -p /etc/nginx/certs
            
            # Copy existing certificates
            sudo cp "${CERT_DIR}/fullchain.pem" /etc/nginx/certs/
            sudo cp "${CERT_DIR}/privkey.pem" /etc/nginx/certs/
            
            # Set proper permissions
            sudo chmod 644 /etc/nginx/certs/fullchain.pem
            sudo chmod 600 /etc/nginx/certs/privkey.pem
            
            echo -e "${GREEN}SSL certificates loaded successfully${NC}"
        else
            echo -e "${YELLOW}Warning: No SSL certificates found in ${CERT_DIR}${NC}"
            echo "Using self-signed certificates for staging..."
        fi
        
        # Start staging environment
        docker-compose -f "${PROJECT_ROOT}/src/backend/docker-compose.staging.yml" up -d
        
        echo -e "${GREEN}Staging environment is ready!${NC}"
        ;;
    # ... other cases remain the same
esac 
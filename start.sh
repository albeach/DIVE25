#!/bin/bash

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Get and export the project root directory
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
export PROJECT_ROOT

# Function to generate secure, MongoDB-safe password
generate_secure_password() {
    chars='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    password=""
    for i in {1..32}; do
        password+="${chars:RANDOM%${#chars}:1}"
    done
    echo "$password"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}Docker is not running. Please start Docker and try again.${NC}"
        exit 1
    fi
}

# Function to check SSL certificates
check_ssl_certificates() {
    local env=$1
    local cert_base="${PROJECT_ROOT}/certificates"
    local compose_path="${PROJECT_ROOT}/src/backend/docker-compose.yml"

    # Set certificate source based on environment
    local cert_source
    if [ "$env" = "dev" ]; then
        cert_source="${cert_base}/dev"
    else
        cert_source="${cert_base}/prod"  # Use prod certs for both staging and production
    fi

    # Check for SSL certificates in the appropriate directory
    if [ ! -d "$cert_source" ]; then
        echo -e "${RED}Certificate directory not found at $cert_source${NC}"
        exit 1
    fi

    if [ -f "$cert_source/fullchain.pem" ] && [ -f "$cert_source/privkey.pem" ]; then
        echo -e "${GREEN}Found existing SSL certificates in $cert_source${NC}"
        
        # Create symlinks or copy certificates to the required location
        mkdir -p "${PROJECT_ROOT}/src/backend/certs"
        cp "$cert_source/fullchain.pem" "${PROJECT_ROOT}/src/backend/certs/fullchain.pem"
        cp "$cert_source/privkey.pem" "${PROJECT_ROOT}/src/backend/certs/privkey.pem"
        echo "Certificates copied to backend/certs directory"
    else
        echo -e "${RED}SSL certificates not found in $cert_source${NC}"
        echo "Required files: fullchain.pem, privkey.pem"
        exit 1
    fi

    # Verify docker-compose file exists
    if [ ! -f "$compose_path" ]; then
        echo -e "${RED}Docker compose file not found at $compose_path${NC}"
        exit 1
    fi
}

# Function to create environment file if it doesn't exist
create_env_file() {
    local env=$1
    local env_file="docker/.env.${env}"

    if [ ! -f "$env_file" ]; then
        echo "Creating ${env} environment file..."
        
        # Generate secure passwords for all services
        MONGO_PASSWORD=$(generate_secure_password)
        DB_PASSWORD=$(generate_secure_password)
        REDIS_PASSWORD=$(generate_secure_password)
        KONG_DB_PASSWORD=$(generate_secure_password)
        KC_DB_PASSWORD=$(generate_secure_password)
        KEYCLOAK_ADMIN_PASSWORD=$(generate_secure_password)
        
        cat > "$env_file" << EOF
# Environment
NODE_ENV=${env}
API_PORT=6969

# MongoDB
MONGO_ROOT_USER=admin
MONGO_ROOT_PASSWORD=${MONGO_PASSWORD}
MONGODB_URI=mongodb://admin:${MONGO_PASSWORD}@mongodb:27017/dive25?authSource=admin

# PostgreSQL
DB_USER=dive25
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=dive25_${env}

# Redis
REDIS_PASSWORD=${REDIS_PASSWORD}

# Kong
KONG_DB_PASSWORD=${KONG_DB_PASSWORD}

# Keycloak
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}
KC_DB_PASSWORD=${KC_DB_PASSWORD}
EOF

        echo "Created $env_file with secure passwords"
        
        # Save passwords to a secure file for admin reference
        if [ "$env" = "staging" ] || [ "$env" = "prod" ]; then
            local password_file="docker/.passwords.${env}"
            cat > "$password_file" << EOF
MongoDB Root Password: ${MONGO_PASSWORD}
Database Password: ${DB_PASSWORD}
Redis Password: ${REDIS_PASSWORD}
Kong DB Password: ${KONG_DB_PASSWORD}
Keycloak Admin Password: ${KEYCLOAK_ADMIN_PASSWORD}
Keycloak DB Password: ${KC_DB_PASSWORD}
EOF
            chmod 600 "$password_file"
            echo "Passwords saved to $password_file"
        fi
    fi
}

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -i :$port > /dev/null; then
        echo -e "${RED}Port $port is already in use. Please stop any existing MongoDB instance.${NC}"
        exit 1
    fi
}

# Function to wait for service availability
wait_for_service() {
    local service=$1
    local port=$2
    local max_attempts=30
    local attempt=1

    echo "Waiting for $service to be ready..."
    while ! nc -z localhost $port 2>/dev/null; do
        if [ $attempt -eq $max_attempts ]; then
            echo -e "${RED}$service did not become available in time${NC}"
            exit 1
        fi
        attempt=$((attempt + 1))
        echo "Attempt $attempt/$max_attempts: $service not ready yet..."
        sleep 2
    done
    echo -e "${GREEN}$service is ready!${NC}"
}

# Function to check if ports are available
check_ports() {
    local ports=(27017 6379 6969 3000 8081 8443)
    local services=("MongoDB" "Redis" "API" "Frontend" "HTTP" "HTTPS")
    
    for i in "${!ports[@]}"; do
        # Only check TCP ports, ignore UDP
        if lsof -i "tcp:${ports[$i]}" > /dev/null 2>&1; then
            echo -e "${RED}Port ${ports[$i]} (${services[$i]}) is already in use.${NC}"
            echo "Please stop any existing services using these ports:"
            lsof -i "tcp:${ports[$i]}"
            exit 1
        fi
    done
    echo -e "${GREEN}All required TCP ports are available${NC}"
}

# Function to clean up existing containers
cleanup_containers() {
    echo "Cleaning up existing containers..."
    docker compose -p $PROJECT_NAME down --remove-orphans
    sleep 2
}

# Function to cleanup networks
cleanup_networks() {
    echo "Checking for existing networks..."
    local network_name="dive25_network"
    
    if docker network ls | grep -q "$network_name"; then
        echo "Found existing network $network_name. Cleaning up..."
        
        # Find and remove containers using the network
        local containers=$(docker network inspect -f '{{range .Containers}}{{.Name}} {{end}}' "$network_name" 2>/dev/null)
        if [ ! -z "$containers" ]; then
            echo "Stopping containers using network: $containers"
            for container in $containers; do
                docker container stop "$container" 2>/dev/null
            done
        fi
        
        # Remove the network
        docker network rm "$network_name" 2>/dev/null
        
        echo "Network cleanup completed"
        sleep 2
    fi
}

# Main script
echo -e "${GREEN}DIVE25 Deployment Script${NC}"
echo "1) Development (Local development environment)"
echo "2) Staging (Test environment)"
echo "3) Production (Live environment)"
read -p "Select deployment type [1-3]: " env_choice

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

echo -e "${GREEN}Starting ${env} Environment...${NC}"

# Create environment file if it doesn't exist
create_env_file $env

# Check SSL certificates for staging and production
if [ "$env" != "dev" ]; then
    check_ssl_certificates $env
fi

# Load base environment variables
if [ -f "docker/.env" ]; then
    export $(cat docker/.env | grep -v '^#' | xargs)
fi

# Load environment-specific variables
if [ -f "docker/.env.${env}" ]; then
    export $(cat "docker/.env.${env}" | grep -v '^#' | xargs)
fi

# Add these before starting services
check_ports
cleanup_networks
cleanup_containers

# Create fresh network
echo "Creating docker network..."
docker network create dive25_network || true

# Then update the service start commands
echo "Starting MongoDB..."
docker compose -p $PROJECT_NAME \
    -f "${PROJECT_ROOT}/src/backend/docker-compose.yml" \
    -f "${PROJECT_ROOT}/src/backend/docker-compose.${env}.yml" \
    up -d mongodb

wait_for_service "MongoDB" 27017

echo "Starting remaining services..."
docker compose -p $PROJECT_NAME \
    -f "${PROJECT_ROOT}/src/backend/docker-compose.yml" \
    -f "${PROJECT_ROOT}/src/backend/docker-compose.${env}.yml" \
    up -d --remove-orphans

echo -e "${GREEN}All services started!${NC}" 
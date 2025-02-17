#!/bin/bash

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Error handling function
handle_error() {
    echo -e "${RED}Error: $1${NC}"
    # Cleanup on error if specified
    if [ "$2" = "cleanup" ]; then
        echo "Cleaning up..."
        docker compose down
        rm -f .env .env.backup
    fi
    exit 1
}

# Check function with error handling
check_command() {
    if ! command -v $1 &> /dev/null; then
        handle_error "$1 is not installed" false
    fi
}

echo -e "${GREEN}DIVE25 Setup${NC}"
echo "==========="

# Check required commands
check_command docker
check_command openssl
check_command curl

# Check if script is run with sudo
if [ "$EUID" -eq 0 ]; then 
    handle_error "Please do not run this script as root/sudo" false
fi

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    handle_error "Docker is not running" false
fi

# Check disk space
AVAILABLE_SPACE=$(df -P . | awk 'NR==2 {print $4}')
if [ "$AVAILABLE_SPACE" -lt 5242880 ]; then  # 5GB in KB
    handle_error "Insufficient disk space. At least 5GB required" false
fi

# Create secure temporary directory
TEMP_DIR=$(mktemp -d)
if [ ! -d "$TEMP_DIR" ]; then
    handle_error "Failed to create temporary directory" false
fi

trap 'rm -rf "$TEMP_DIR"' EXIT

# Generate secure passwords
echo "Generating secure passwords..."
generate_password() {
    openssl rand -base64 32 || handle_error "Failed to generate password" true
}

DEFAULT_KONG_PASSWORD=$(generate_password)
DEFAULT_KEYCLOAK_PASSWORD=$(generate_password)
DEFAULT_MONGO_PASSWORD=$(generate_password)

# Create necessary directories
echo "Creating directories..."
for dir in docker/{kong,keycloak,postgres}; do
    if ! mkdir -p $dir; then
        handle_error "Failed to create directory: $dir" true
    fi
done

# Create .env file
echo "Creating environment files..."
create_env_file() {
    cat > "$1" << EOL || handle_error "Failed to create $1" true
# Kong
KONG_DB_PASSWORD=${KONG_DB_PASSWORD:-$DEFAULT_KONG_PASSWORD}

# Keycloak
KEYCLOAK_ADMIN=${KEYCLOAK_ADMIN:-admin}
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD:-$DEFAULT_KEYCLOAK_PASSWORD}
KC_DB_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD:-$DEFAULT_KEYCLOAK_PASSWORD}

# MongoDB
MONGO_ROOT_USER=${MONGO_ROOT_USER:-mongouser}
MONGO_ROOT_PASSWORD=${MONGO_ROOT_PASSWORD:-$DEFAULT_MONGO_PASSWORD}
EOL

    chmod 600 "$1" || handle_error "Failed to set permissions on $1" true
}

create_env_file ".env"
create_env_file ".env.backup"

# Verify Docker Compose file exists
if [ ! -f "docker-compose.yml" ]; then
    handle_error "docker-compose.yml not found" true
fi

# Install dependencies if package.json exists
if [ -f "package.json" ]; then
    echo "Installing npm dependencies..."
    if ! npm install; then
        handle_error "Failed to install npm dependencies" true
    fi
fi

# Start services
echo "Starting Docker services..."
if ! docker compose up -d; then
    handle_error "Failed to start Docker services" true
fi

# Health check function
check_service_health() {
    local service=$1
    local max_attempts=30
    local attempt=1

    echo -n "Checking $service health "
    while [ $attempt -le $max_attempts ]; do
        if docker compose ps $service | grep -q "healthy"; then
            echo -e "\n${GREEN}$service is healthy${NC}"
            return 0
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    echo -e "\n${RED}$service failed to become healthy${NC}"
    return 1
}

# Check each service
for service in kong keycloak mongodb; do
    if ! check_service_health $service; then
        handle_error "Service $service failed health check" true
    fi
done

# Final verification
if docker compose ps | grep -q "unhealthy\|exit"; then
    handle_error "Some services failed to start properly" true
else
    echo -e "${GREEN}Setup completed successfully!${NC}"
    echo "Credentials saved in .env.backup"
    echo -e "${YELLOW}WARNING: Please save these credentials securely and delete .env.backup${NC}"
fi

# Save service URLs
echo "Service URLs:" > service_urls.txt
echo "Kong Admin: http://localhost:8001" >> service_urls.txt
echo "Keycloak: http://localhost:8080" >> service_urls.txt
chmod 600 service_urls.txt

exit 0 
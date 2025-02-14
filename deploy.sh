#!/bin/bash

# At the beginning of the script, after the shebang
if [[ "$(uname)" == "Darwin" && $EUID -eq 0 ]]; then
    echo "On MacOS, please run this script without sudo"
    exit 1
fi

# DIVE25/deploy.sh
# Main deployment script for DIVE25 platform

# Source utility functions and configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/scripts/setup/certificates.sh"
source "${SCRIPT_DIR}/scripts/setup/docker.sh"
source "${SCRIPT_DIR}/scripts/setup/monitoring.sh"
source "${SCRIPT_DIR}/scripts/deployment/profiles.sh"
source "${SCRIPT_DIR}/scripts/deployment/containers.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Logging function
log() {
    local level=$1
    shift
    local message=$@
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    case $level in
        "INFO")  echo -e "${GREEN}[INFO]${NC} ${timestamp} - $message" ;;
        "WARN")  echo -e "${YELLOW}[WARN]${NC} ${timestamp} - $message" ;;
        "ERROR") echo -e "${RED}[ERROR]${NC} ${timestamp} - $message" ;;
    esac
}

# Detect if running on Apple Silicon ARM64 and set Docker platform flag
if [[ "$(uname)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
    export DOCKER_PLATFORM_FLAG="--platform linux/arm64"
    log "INFO" "Detected Apple Silicon ARM64. Docker commands will use platform flag: $DOCKER_PLATFORM_FLAG."
fi

# Function to check prerequisites
check_prerequisites() {
    log "INFO" "Checking deployment prerequisites..."
    
    check_required_env_vars

    # Check required tools
    local required_tools=("docker" "kubectl" "helm" "openssl" "node")
    for tool in "${required_tools[@]}"; do
        if ! command -v $tool &> /dev/null; then
            log "ERROR" "$tool is required but not installed"
            exit 1
        fi
    done

    # Check required files
    local required_files=(
        "licenses/pingfederate.lic"
        "licenses/pingaccess.lic"
        "licenses/pingdirectory.lic"
    )
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            log "ERROR" "Required file $file is missing"
            exit 1
        fi
    done
}

# New function to check required environment variables
check_required_env_vars() {
    local required_vars=("WP_DB_PASSWORD" "MYSQL_ROOT_PASSWORD" "MONGO_ROOT_USER" "MONGO_ROOT_PASSWORD" "GRAFANA_ADMIN_PASSWORD")
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            if [ "$var" = "MONGO_ROOT_USER" ]; then
                log "INFO" "Environment variable MONGO_ROOT_USER is not set, defaulting to 'dive25mongo'."
                export MONGO_ROOT_USER="dive25mongo"
            else
                read -s -p "Enter value for $var: " value
                echo ""
                eval "export $var='$value'"
            fi
        fi
    done
}

# Function to build TypeScript
build_typescript() {
    log "INFO" "Building TypeScript projects..."
    
    # Build backend
    cd src/backend
    npm install
    npm run build
    if [ $? -ne 0 ]; then
        log "ERROR" "Backend TypeScript build failed"
        exit 1
    fi
    cd ../..
    
    log "INFO" "TypeScript build completed successfully"
}

# New function to configure Ping Identity settings
configure_ping_identity() {
    log "INFO" "Applying Ping Identity configurations..."
    if [ -f "dive25-pingconfigs.sh" ]; then
        bash dive25-pingconfigs.sh
        if [ $? -ne 0 ]; then
            log "ERROR" "Ping Identity configuration script failed"
            exit 1
        fi
        log "INFO" "Ping Identity configurations applied successfully"
    else
        log "WARN" "Ping Identity configuration script not found, skipping..."
    fi
}

# Function to deploy development environment
deploy_development() {
    log "INFO" "Starting development environment deployment..."
    
    # Setup development certificates
    setup_development_certificates
    
    # Deploy Docker containers
    deploy_docker_containers "dev"
    
    # Deploy server profiles
    deploy_server_profiles "dev"
    
    # Apply Ping Identity configurations
    configure_ping_identity

    # Fix permissions on mounted volumes in the container
    fix_permissions

    # Setup monitoring
    setup_monitoring "dev"
    
    log "INFO" "Development deployment completed successfully"
}

# Function to deploy production environment
deploy_production() {
    log "INFO" "Starting production environment deployment..."
    
    # Setup Let's Encrypt certificates
    setup_production_certificates
    
    # Deploy Docker containers
    deploy_docker_containers "prod"
    
    # Deploy server profiles
    deploy_server_profiles "prod"
    
    # Apply Ping Identity configurations
    configure_ping_identity

    # Fix permissions on mounted volumes in the container
    fix_permissions

    # Setup monitoring with alerting
    setup_monitoring "prod"
    
    log "INFO" "Production deployment completed successfully"
}

# New function to fix permissions on mounted volumes
fix_permissions() {
    # Use CONTAINER_NAME if set, otherwise default to 'ping-manager'
    : "${CONTAINER_NAME:=ping-manager}"
    log "INFO" "Fixing permissions on mounted volumes in container $CONTAINER_NAME..."
    
    docker exec "$CONTAINER_NAME" chmod -R 755 /opt/certificates/prod
    docker exec "$CONTAINER_NAME" chmod -R 755 /opt/out
    docker exec "$CONTAINER_NAME" sh -c 'if [ -d /certificates ]; then cp -r /certificates/* /opt/certificates/prod/; fi'
    
    if [ $? -ne 0 ]; then
       log "ERROR" "Permission fix failed on container $CONTAINER_NAME"
       exit 1
    fi
    log "INFO" "Permissions fixed successfully"
}

# Main execution
main() {
    local environment=$1
    
    # Validate environment argument
    if [[ ! "$environment" =~ ^(dev|prod)$ ]]; then
        log "ERROR" "Invalid environment. Use 'dev' or 'prod'"
        exit 1
    fi
    
    # Check prerequisites
    check_prerequisites
    
    # Deploy based on environment
    case $environment in
        "dev")
            deploy_development
            ;;
        "prod")
            deploy_production
            ;;
    esac

    echo "Pausing for 5 seconds to allow containers to stabilize. Please watch the terminal..."
    sleep 5
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Validate root/sudo access based on platform
    if [[ "$(uname)" == "Darwin" ]]; then
        # On MacOS, script should run as non-root
        if [[ $EUID -eq 0 ]]; then
            log "ERROR" "On MacOS, please run this script without sudo"
            exit 1
        fi
    else
        # On Linux, script needs root
        if [[ $EUID -ne 0 ]]; then
            log "ERROR" "On Linux, this script must be run as root or with sudo"
            exit 1
        fi
    fi

    if [[ "$1" == "--skip-memory-check" ]]; then
        export SKIP_MEMORY_CHECK=true
        shift  # Remove the flag from arguments
    fi
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --ping-user)
                PING_IDENTITY_DEVOPS_USER="$2"
                shift 2
                ;;
            --ping-key)
                PING_IDENTITY_DEVOPS_KEY="$2"
                shift 2
                ;;
            --help)
                echo "Usage: $0 --env <dev|prod> --ping-user <username> --ping-key <key>"
                exit 0
                ;;
            *)
                log "ERROR" "Unknown parameter: $1"
                exit 1
                ;;
        esac
    done
    
    # Validate required parameters
    if [[ -z "$ENVIRONMENT" || -z "$PING_IDENTITY_DEVOPS_USER" || -z "$PING_IDENTITY_DEVOPS_KEY" ]]; then
        log "ERROR" "Missing required parameters"
        echo "Usage: $0 --env <dev|prod> --ping-user <username> --ping-key <key>"
        exit 1
    fi

    # Execute main function
    main "$ENVIRONMENT"
fi
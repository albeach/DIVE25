#!/bin/bash

# At the beginning of the script, after the shebang
if [[ "$(uname)" == "Darwin" && $EUID -eq 0 ]]; then
    echo "On MacOS, please run this script without sudo"
    exit 1
fi

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

# Function to set up wait-for-it script
setup_wait_for_it() {
    log "INFO" "Setting up wait-for-it script..."
    
    # No need to copy since it already exists in the right place
    chmod +x "${SCRIPT_DIR}/scripts/deployment/wait-for-it.sh"
}

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

# Function to check required environment variables
check_required_env_vars() {
    # If a .env file exists in the root directory, source it to load environment variables
    if [ -f ".env" ]; then
        log "INFO" "Loading environment variables from .env file"
        set -a
        . .env
        set +a
    fi
    local required_vars=(
        "WP_DB_PASSWORD" 
        "MYSQL_ROOT_PASSWORD" 
        "MONGO_ROOT_USER" 
        "MONGO_ROOT_PASSWORD" 
        "GRAFANA_ADMIN_PASSWORD"
        "PING_IDENTITY_PASSWORD"
    )
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            if [ "$var" = "MONGO_ROOT_USER" ]; then
                log "INFO" "Environment variable MONGO_ROOT_USER is not set, defaulting to 'dive25mongo'."
                export MONGO_ROOT_USER="dive25mongo"
            elif [ "$var" = "PING_IDENTITY_PASSWORD" ]; then
                log "INFO" "Setting default PING_IDENTITY_PASSWORD to '2FederateM0re'"
                export PING_IDENTITY_PASSWORD="2FederateM0re"
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
    local environment=$1
    log "INFO" "Building TypeScript projects for ${environment}..."
    
    # Run cleanup and build with environment
    "${SCRIPT_DIR}/scripts/maintenance/cleanup.sh" "$environment"
    if [ $? -ne 0 ]; then
        log "ERROR" "Cleanup and build process failed"
        exit 1
    fi
    
    log "INFO" "TypeScript build completed successfully"
}

# Function to configure Ping Identity settings
configure_ping_identity() {
    log "INFO" "Applying Ping Identity configurations..."
    if [ -f "dive25-pingconfigs.sh" ]; then
        chmod +x dive25-pingconfigs.sh
        ./dive25-pingconfigs.sh
        ret=$?
        if [ $ret -ne 0 ]; then
            log "ERROR" "Ping Identity configuration script failed with exit code $ret"
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
    
    # Setup wait-for-it script
    setup_wait_for_it
    
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

    # Prompt to optionally skip Let's Encrypt certificate generation
    read -p "Do you want to skip Let's Encrypt certificate generation? (y/N): " skip_cert_input
    skip_cert_input_lower=$(echo "$skip_cert_input" | tr '[:upper:]' '[:lower:]')
    if [[ "$skip_cert_input_lower" == "y" ]]; then
         log "INFO" "Skipping Let's Encrypt certificate generation as per user request."
         export SKIP_LETSENCRYPT=true
    else
         log "INFO" "Generating Let's Encrypt certificates..."
         if ! setup_production_certificates; then
              log "ERROR" "Let's Encrypt certificate generation failed. Please fix this before proceeding."
              exit 1
         fi
    fi

    # If skipping, warn if the expected certificate file is missing
    if [ "$SKIP_LETSENCRYPT" = true ]; then
         if [ ! -f "./certificates/prod/cert.pem" ]; then
              log "WARN" "Expected certificate file './certificates/prod/cert.pem' not found. Ensure your deployment does not depend on these certificates."
         fi
    fi

    # Setup wait-for-it script
    setup_wait_for_it

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

# Function to fix permissions on mounted volumes
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

# Main execution function
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

    log "INFO" "Pausing for 5 seconds to allow containers to stabilize..."
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
            --help)
                echo "Usage: $0 --env <dev|prod> [--skip-memory-check]"
                exit 0
                ;;
            *)
                log "ERROR" "Unknown parameter: $1"
                exit 1
                ;;
        esac
    done
    
    # Validate required parameters
    if [[ -z "$ENVIRONMENT" ]]; then
        log "ERROR" "Missing required parameter --env <dev|prod>"
        echo "Usage: $0 --env <dev|prod> [--skip-memory-check]"
        exit 1
    fi

    # Execute main function
    main "$ENVIRONMENT"
fi
#!/bin/bash

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

setup_wait_for_it() {
    log "INFO" "Setting up wait-for-it script..."
    
    mkdir -p "${SCRIPT_DIR}/scripts"
    cp "${SCRIPT_DIR}/wait-for-it.sh" "${SCRIPT_DIR}/scripts/"
    chmod +x "${SCRIPT_DIR}/scripts/wait-for-it.sh"
}

check_prerequisites() {
    log "INFO" "Checking deployment prerequisites..."
    
    # Check root/sudo access based on platform
    if [[ "$(uname)" == "Darwin" ]]; then
        if [[ $EUID -eq 0 ]]; then
            log "ERROR" "On MacOS, please run this script without sudo"
            exit 1
        fi
    else
        if [[ $EUID -ne 0 ]]; then
            log "ERROR" "On Linux, this script must be run as root or with sudo"
            exit 1
        fi
    fi
    
    check_required_env_vars
    check_required_tools
    check_system_resources
}

check_required_env_vars() {
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
    )
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            if [ "$var" = "MONGO_ROOT_USER" ]; then
                export MONGO_ROOT_USER="dive25mongo"
                log "INFO" "Setting default MONGO_ROOT_USER to 'dive25mongo'"
            else
                read -s -p "Enter value for $var: " value
                echo ""
                export "$var=$value"
            fi
        fi
    done
}

check_required_tools() {
    local required_tools=("docker" "docker-compose" "openssl" "curl")
    for tool in "${required_tools[@]}"; do
        if ! command -v $tool &> /dev/null; then
            log "ERROR" "$tool is required but not installed"
            exit 1
        fi
    done
}

deploy_environment() {
    local environment=$1
    
    log "INFO" "Starting deployment for ${environment} environment"
    
    # Setup wait-for-it script
    setup_wait_for_it
    
    # Deploy certificates
    if [[ "$environment" == "prod" ]]; then
        setup_production_certificates
    else
        setup_development_certificates
    fi
    
    # Deploy containers
    deploy_docker_containers "$environment"
    
    # Deploy server profiles
    deploy_server_profiles "$environment"
    
    # Setup monitoring
    setup_monitoring "$environment"
    
    log "INFO" "${environment} deployment completed successfully"
}

main() {
    local environment=$1
    
    if [[ ! "$environment" =~ ^(dev|prod)$ ]]; then
        log "ERROR" "Invalid environment. Use 'dev' or 'prod'"
        exit 1
    }
    
    check_prerequisites
    deploy_environment "$environment"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --skip-memory-check)
            export SKIP_MEMORY_CHECK=true
            shift
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

if [[ -z "$ENVIRONMENT" ]]; then
    log "ERROR" "Missing required parameter --env <dev|prod>"
    echo "Usage: $0 --env <dev|prod> [--skip-memory-check]"
    exit 1
fi

main "$ENVIRONMENT"
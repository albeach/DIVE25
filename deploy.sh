#!/bin/bash

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

# Function to check prerequisites
check_prerequisites() {
    log "INFO" "Checking deployment prerequisites..."
    
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

# Function to deploy development environment
deploy_development() {
    log "INFO" "Starting development environment deployment..."
    
    # Setup development certificates
    setup_development_certificates
    
    # Deploy Docker containers
    deploy_docker_containers "dev"
    
    # Deploy server profiles
    deploy_server_profiles "dev"
    
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
    
    # Setup monitoring with alerting
    setup_monitoring "prod"
    
    log "INFO" "Production deployment completed successfully"
}

# Main execution
main() {
    local environment=$1
    
    # Validate environment argument
    if [[ ! "$environment" =~ ^(dev|prod)$ ]]; then
        log "ERROR" "Invalid environment. Use 'dev' or 'prod'"
        exit 1
    }
    
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
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Validate root/sudo access
    if [[ $EUID -ne 0 ]]; then
        log "ERROR" "This script must be run as root or with sudo"
        exit 1
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
#!/bin/bash

# deployment.sh
# DIVE25 Initial Deployment Script

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level=$1
    shift
    local message=$@
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    case $level in
        "INFO")
            echo -e "${GREEN}[INFO]${NC} ${timestamp} - $message"
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} ${timestamp} - $message"
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} ${timestamp} - $message"
            ;;
    esac
}

# Error handling
set -e
trap 'log "ERROR" "An error occurred on line $LINENO. Exiting..."; exit 1' ERR

# Check prerequisites
check_prerequisites() {
    log "INFO" "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log "ERROR" "Docker is not installed. Please install Docker first."
        exit 1
    fi

    # Check Node.js
    if ! command -v node &> /dev/null; then
        log "ERROR" "Node.js is not installed. Please install Node.js first."
        exit 1
    fi

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log "ERROR" "kubectl is not installed. Please install kubectl first."
        exit 1
    fi

    # Check helm
    if ! command -v helm &> /dev/null; then
        log "ERROR" "Helm is not installed. Please install Helm first."
        exit 1
    fi

    log "INFO" "All prerequisites satisfied."
}

# Create directory structure
create_directory_structure() {
    log "INFO" "Creating directory structure..."
    
    mkdir -p dive25/{src,docker,config,licenses,helm,scripts}
    mkdir -p dive25/src/{backend,policies,wordpress}
    mkdir -p dive25/docker/monitoring
    mkdir -p dive25/config/{pingfederate,pingaccess,pingdirectory}
    
    log "INFO" "Directory structure created successfully."
}

# Check and copy license files
setup_licenses() {
    log "INFO" "Setting up license files..."
    
    local license_dir="dive25/licenses"
    
    # Check for required license files
    for product in "pingfederate" "pingaccess" "pingdirectory"; do
        if [[ ! -f "input/${product}.lic" ]]; then
            log "ERROR" "Missing license file: ${product}.lic"
            exit 1
        fi
        cp "input/${product}.lic" "${license_dir}/"
    done
    
    log "INFO" "License files copied successfully."
}

# Generate configuration files
generate_configs() {
    log "INFO" "Generating configuration files..."
    
    # Generate .env file
    cat > dive25/.env << EOL
# Environment
NODE_ENV=development
PORT=3001

# Ping Identity
PING_IDENTITY_DEVOPS_USER=${PING_IDENTITY_DEVOPS_USER:-""}
PING_IDENTITY_DEVOPS_KEY=${PING_IDENTITY_DEVOPS_KEY:-""}

# MongoDB
MONGO_URI=mongodb://localhost:27017/dive25

# Redis
REDIS_URL=redis://localhost:6379

# Domain settings
DOMAIN_DEV=dive25.local
DOMAIN_PROD=dive25.com
EOL

    log "INFO" "Configuration files generated successfully."
}

# Setup Docker environment
setup_docker() {
    log "INFO" "Setting up Docker environment..."
    
    cd dive25/docker
    
    # Copy docker-compose file
    cat > docker-compose.yml << EOL
# ... (previous docker-compose content) ...
EOL

    # Start containers
    docker-compose up -d
    
    # Wait for containers to be ready
    sleep 30
    
    # Verify containers are running
    if ! docker-compose ps | grep -q "Up"; then
        log "ERROR" "Container startup failed. Please check docker-compose logs."
        exit 1
    fi
    
    cd ../
    log "INFO" "Docker environment setup successfully."
}

# Initialize backend
setup_backend() {
    log "INFO" "Setting up backend..."
    
    cd dive25/src/backend
    
    # Initialize Node.js project
    npm init -y
    
    # Install dependencies
    npm install express express-jwt mongodb @open-policy-agent/opa-wasm axios dotenv helmet cors winston ldapjs
    npm install --save-dev typescript @types/express @types/node ts-node nodemon
    
    # Copy TypeScript configuration
    cat > tsconfig.json << EOL
{
    "compilerOptions": {
        "target": "es2020",
        "module": "commonjs",
        "outDir": "./dist",
        "rootDir": "./src",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules"]
}
EOL

    cd ../../
    log "INFO" "Backend setup completed successfully."
}

# Deploy monitoring stack
setup_monitoring() {
    log "INFO" "Setting up monitoring stack..."
    
    cd dive25/docker/monitoring
    
    # Deploy Prometheus and Grafana
    docker-compose -f monitoring-stack.yml up -d
    
    cd ../../
    log "INFO" "Monitoring stack deployed successfully."
}

# Main deployment function
main() {
    log "INFO" "Starting DIVE25 deployment..."
    
    # Run deployment steps
    check_prerequisites
    create_directory_structure
    setup_licenses
    generate_configs
    setup_docker
    setup_backend
    setup_monitoring
    
    log "INFO" "Initial deployment completed successfully."
    log "INFO" "Please configure PingFederate and PingAccess using the admin consoles:"
    log "INFO" "PingFederate: https://localhost:9999/pingfederate"
    log "INFO" "PingAccess: https://localhost:9000"
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Check if running with correct permissions
    if [[ $EUID -ne 0 ]]; then
        log "ERROR" "This script must be run as root or with sudo"
        exit 1
    fi
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --ping-user)
                PING_IDENTITY_DEVOPS_USER="$2"
                shift 2
                ;;
            --ping-key)
                PING_IDENTITY_DEVOPS_KEY="$2"
                shift 2
                ;;
            --help)
                echo "Usage: $0 --ping-user <username> --ping-key <key>"
                exit 0
                ;;
            *)
                log "ERROR" "Unknown parameter: $1"
                exit 1
                ;;
        esac
    done
    
    # Validate required parameters
    if [[ -z "$PING_IDENTITY_DEVOPS_USER" || -z "$PING_IDENTITY_DEVOPS_KEY" ]]; then
        log "ERROR" "Ping Identity credentials are required"
        echo "Usage: $0 --ping-user <username> --ping-key <key>"
        exit 1
    fi
    
    # Execute main function
    main
fi
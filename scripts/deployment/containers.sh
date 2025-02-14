# DIVE25/scripts/deployment/containers.sh

# This script manages container deployment and lifecycle operations for the DIVE25 platform.
# It handles container creation, health checks, scaling, and cleanup for both
# development and production environments.

check_docker_auth() {
    log "INFO" "Checking Docker authentication status"
    
    if ! docker info >/dev/null 2>&1; then
        log "ERROR" "Docker daemon is not running"
        exit 1
    fi
}

setup_docker_config() {
    # Create docker config directory
    mkdir -p ~/.docker

    # Setup platform-specific Docker configuration
    if [[ "$(uname)" == "Darwin" ]]; then
        # MacOS configuration
        cat > ~/.docker/config.json << EOL
{
    "credsStore": "osxkeychain",
    "experimental": "enabled",
    "features": {
        "buildkit": "1"
    }
}
EOL
    else
        # Linux configuration
        cat > ~/.docker/config.json << EOL
{
    "experimental": "enabled",
    "features": {
        "buildkit": "1"
    }
}
EOL
    fi
    chmod 600 ~/.docker/config.json
}

deploy_docker_containers() {
    local environment=$1
    
    log "INFO" "Beginning container deployment for ${environment}"

    # Force non-root execution on MacOS
    if [[ "$(uname)" == "Darwin" && $EUID -eq 0 ]]; then
        log "ERROR" "On MacOS, please run this script as a regular user, not with sudo"
        exit 1
    fi

    # Set environment variables
    export COMPOSE_PROJECT_NAME="dive25"
    export DOCKER_BUILDKIT=1
    export COMPOSE_DOCKER_CLI_BUILD=1

    # Create .env file for Docker Compose with proper permissions
    cat << EOL > "${SCRIPT_DIR}/.env"
PING_IDENTITY_DEVOPS_USER=${PING_IDENTITY_DEVOPS_USER}
PING_IDENTITY_DEVOPS_KEY=${PING_IDENTITY_DEVOPS_KEY}
PA_ADMIN_PASSWORD_INITIAL=
COMPOSE_PROJECT_NAME=dive25
EOL
    chmod 600 "${SCRIPT_DIR}/.env"

    # Deploy containers
    if [[ "$(uname)" == "Darwin" ]]; then
        # MacOS: run without sudo
        docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" down --remove-orphans
        docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" pull
        docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" up -d
    else
        # Linux: use sudo
        sudo docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" down --remove-orphans
        sudo docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" pull
        sudo docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" up -d
    fi

    # Check if deployment was successful
    if [ $? -ne 0 ]; then
        log "ERROR" "Failed to deploy containers. Checking Docker logs..."
        docker-compose -f "${SCRIPT_DIR}/docker-compose.yml" logs
        exit 1
    fi

# Add WordPress setup to deploy_docker_containers()

setup_wordpress() {
    local environment=$1
    
    log "INFO" "Setting up WordPress environment"
    
    # Create required directories
    mkdir -p "${SCRIPT_DIR}/wordpress/plugins/dive25-integration"
    mkdir -p "${SCRIPT_DIR}/wordpress/themes/dive25"
    
    # Copy our custom plugin
    cp -r "${SCRIPT_DIR}/src/wordpress/plugins/dive25-integration/"* \
        "${SCRIPT_DIR}/wordpress/plugins/dive25-integration/"
    
    # Set proper permissions
    chmod -R 755 "${SCRIPT_DIR}/wordpress"
    
    # Generate WordPress salts securely
    local wp_config="${SCRIPT_DIR}/wordpress/wp-config.php"
    if [[ ! -f "$wp_config" ]]; then
        curl -s https://api.wordpress.org/secret-key/1.1/salt/ > wp-salts.txt
        # We'll use these salts in our WordPress configuration
    fi
}

# Add this to the main deployment flow
if [[ "$environment" == "prod" ]]; then
    setup_wordpress "prod"
else
    setup_wordpress "dev"
fi

    # Validate requirements and verify deployment
    validate_container_requirements "$environment"
    verify_container_deployment "$environment"
}

validate_container_requirements() {
    local environment=$1
    
    log "INFO" "Validating container deployment requirements"
    
    # Check system resources
    check_system_resources
}

check_system_resources() {
    log "INFO" "Checking system resources"

    # Check available disk space in a cross-platform way
    local available_space
    if [[ "$(uname)" == "Darwin" ]]; then
        available_space=$(df -k . | awk 'NR==2 {print $4}')
    else
        available_space=$(df -P . | awk 'NR==2 {print $4}')
    fi

    if [ "$available_space" -lt 10485760 ]; then  # 10GB in KB
        log "ERROR" "Insufficient disk space. At least 10GB required"
        exit 1
    fi

    # Check available memory in a cross-platform way
    local available_memory
    if [[ "$(uname)" == "Darwin" ]]; then
        local page_size=$(pagesize)
        local free_pages=$(vm_stat | awk '/free/ {gsub(/\./, "", $3); print $3}')
        available_memory=$((free_pages * page_size / 1024 / 1024))
    else
        available_memory=$(free -m | awk 'NR==2 {print $7}')
    fi

    # Set memory requirements based on environment
    local required_memory
    if [[ "$environment" == "prod" ]]; then
        required_memory=4096  # 4GB for production
    else
        required_memory=2048  # 2GB for development
    fi

    # Check for memory requirements unless SKIP_MEMORY_CHECK is set
    if [[ -n "${SKIP_MEMORY_CHECK}" ]]; then
        log "WARN" "Skipping memory check. This might affect system stability"
        return 0
    elif [ "$available_memory" -lt "$required_memory" ]; then
        log "ERROR" "Insufficient memory. At least ${required_memory}MB required"
        log "INFO" "To bypass this check, run the script with SKIP_MEMORY_CHECK=true"
        exit 1
    fi
}

verify_container_deployment() {
    local environment=$1
    
    log "INFO" "Verifying container deployment"
    
    # Wait for services to be ready
    wait_for_services
    
    # Check container health status
    local unhealthy_containers=$(docker ps --filter "health=unhealthy" --format "{{.Names}}")
    if [ ! -z "$unhealthy_containers" ]; then
        log "ERROR" "Found unhealthy containers: $unhealthy_containers"
        exit 1
    fi
    
    # Verify service connectivity
    verify_service_connectivity
    
    log "INFO" "Container deployment verification completed successfully"
}

wait_for_services() {
    log "INFO" "Waiting for services to be ready"
    
    # Get actual container names from docker ps
    local containers=$(docker ps --format '{{.Names}}' | grep 'dive25')
    local timeout=300  # 5 minutes timeout
    local interval=10  # Check every 10 seconds
    
    for container in $containers; do
        if [[ $container == *"pingfederate"* ]] || [[ $container == *"pingaccess"* ]] || [[ $container == *"pingdirectory"* ]]; then
            local elapsed=0
            while [ $elapsed -lt $timeout ]; do
                if docker exec $container /opt/out/instance/bin/status.sh > /dev/null 2>&1; then
                    log "INFO" "${container} is ready"
                    break
                fi
                
                elapsed=$((elapsed + interval))
                if [ $elapsed -eq $timeout ]; then
                    log "ERROR" "Timeout waiting for ${container} to be ready"
                    exit 1
                fi
                
                sleep $interval
            done
        fi
    done
}

verify_service_connectivity() {
    # Verify PingFederate Admin Console
    curl -sk https://localhost:9999/pingfederate/app > /dev/null || {
        log "ERROR" "Cannot connect to PingFederate Admin Console"
        exit 1
    }
    
    # Verify PingAccess Admin Console
    curl -sk https://localhost:9000 > /dev/null || {
        log "ERROR" "Cannot connect to PingAccess Admin Console"
        exit 1
    }
    
    # Verify PingDirectory LDAPS
    ldapsearch -H ldaps://localhost:1636 -b "cn=config" -s base "objectclass=*" > /dev/null 2>&1 || {
        log "ERROR" "Cannot connect to PingDirectory LDAPS"
        exit 1
    }
}
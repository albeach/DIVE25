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

    # Setup wait-for-it script
    setup_wait_for_it

    # Create .env file for Docker Compose with proper permissions
    cat << EOL > "${SCRIPT_DIR}/.env"
COMPOSE_PROJECT_NAME=dive25
EOL
    chmod 600 "${SCRIPT_DIR}/.env"

    # Deploy containers with proper waiting
    if [[ "$(uname)" == "Darwin" ]]; then
        # MacOS: run without sudo
        docker compose -f "${SCRIPT_DIR}/docker-compose.yml" \
                      -f "${SCRIPT_DIR}/docker-compose.${environment}.yml" down --remove-orphans

        # Start core services first
        docker compose -f "${SCRIPT_DIR}/docker-compose.yml" \
                      -f "${SCRIPT_DIR}/docker-compose.${environment}.yml" up -d pingdirectory
        
        # Wait for PingDirectory
        "${SCRIPT_DIR}/scripts/wait-for-it.sh" localhost:1389 -t 120

        # Start PingFederate
        docker compose -f "${SCRIPT_DIR}/docker-compose.yml" \
                      -f "${SCRIPT_DIR}/docker-compose.${environment}.yml" up -d pingfederate
        
        # Wait for PingFederate
        "${SCRIPT_DIR}/scripts/wait-for-it.sh" localhost:9031 -t 120

        # Start remaining services
        docker compose -f "${SCRIPT_DIR}/docker-compose.yml" \
                      -f "${SCRIPT_DIR}/docker-compose.${environment}.yml" up -d
    else
        # Linux: use sudo
        sudo docker compose -f "${SCRIPT_DIR}/docker-compose.yml" \
                           -f "${SCRIPT_DIR}/docker-compose.${environment}.yml" down --remove-orphans

        # Start core services first
        sudo docker compose -f "${SCRIPT_DIR}/docker-compose.yml" \
                           -f "${SCRIPT_DIR}/docker-compose.${environment}.yml" up -d pingdirectory
        
        # Wait for PingDirectory
        sudo "${SCRIPT_DIR}/scripts/wait-for-it.sh" localhost:1389 -t 120

        # Start PingFederate
        sudo docker compose -f "${SCRIPT_DIR}/docker-compose.yml" \
                           -f "${SCRIPT_DIR}/docker-compose.${environment}.yml" up -d pingfederate
        
        # Wait for PingFederate
        sudo "${SCRIPT_DIR}/scripts/wait-for-it.sh" localhost:9031 -t 120

        # Start remaining services
        sudo docker compose -f "${SCRIPT_DIR}/docker-compose.yml" \
                           -f "${SCRIPT_DIR}/docker-compose.${environment}.yml" up -d
    fi

    # Check if deployment was successful
    if [ $? -ne 0 ]; then
        log "ERROR" "Failed to deploy containers. Checking Docker logs..."
        docker compose -f "${SCRIPT_DIR}/docker-compose.yml" logs
        exit 1
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

verify_container_deployment() {
    local environment=$1
    
    log "INFO" "Verifying container deployment"
    
    # Wait for services to be ready
    wait_for_services
    
    # Monitor core services
    monitor_container_startup "pingdirectory" "1389" "120" || exit 1
    monitor_container_startup "pingfederate" "9031" "120" || exit 1
    monitor_container_startup "pingaccess" "3000" "120" || exit 1
    
    if [[ "$environment" == "prod" ]]; then
        monitor_container_startup "mariadb" "3306" "60" || exit 1
        monitor_container_startup "mongodb" "27017" "60" || exit 1
    fi
    
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

monitor_container_startup() {
    local container_name=$1
    local port=$2
    local timeout=$3
    
    log "INFO" "Monitoring startup of ${container_name} on port ${port}"
    
    if "${SCRIPT_DIR}/scripts/wait-for-it.sh" "localhost:${port}" -t "${timeout}"; then
        log "INFO" "${container_name} is available on port ${port}"
        return 0
    else
        log "ERROR" "Failed to connect to ${container_name} on port ${port}"
        return 1
    fi
}
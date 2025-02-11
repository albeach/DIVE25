# DIVE25/scripts/setup/docker.sh

# This script handles Docker-related setup and deployment operations,
# including container management and environment configuration.

setup_docker_environment() {
    local environment=$1
    
    log "INFO" "Setting up Docker environment for ${environment}"
    
    # Load environment variables
    if [[ "$environment" == "prod" ]]; then
        source "${SCRIPT_DIR}/.env.prod"
    else
        source "${SCRIPT_DIR}/.env.dev"
    fi
    
    # Verify Docker is running
    if ! docker info > /dev/null 2>&1; then
        log "ERROR" "Docker is not running"
        exit 1
    fi
    
    # Create required networks
    docker network create dive25-net 2>/dev/null || true
    
    # Create required volumes
    docker volume create pingfederate-out 2>/dev/null || true
    docker volume create pingaccess-out 2>/dev/null || true
    docker volume create pingdirectory-out 2>/dev/null || true
}

deploy_docker_containers() {
    local environment=$1
    
    log "INFO" "Deploying Docker containers for ${environment}"
    
    # Stop any existing containers
    docker-compose -f "${SCRIPT_DIR}/docker/docker-compose.yml" \
        -f "${SCRIPT_DIR}/docker/docker-compose.${environment}.yml" \
        down
    
    # Start containers
    docker-compose -f "${SCRIPT_DIR}/docker/docker-compose.yml" \
        -f "${SCRIPT_DIR}/docker/docker-compose.${environment}.yml" \
        up -d
    
    # Wait for containers to be ready
    wait_for_containers
}

wait_for_containers() {
    local containers=("pingfederate" "pingaccess" "pingdirectory")
    
    for container in "${containers[@]}"; do
        log "INFO" "Waiting for ${container} to be ready..."
        
        local attempts=0
        while [ $attempts -lt 30 ]; do
            if docker container inspect -f '{{.State.Running}}' $container 2>/dev/null | grep -q "true"; then
                log "INFO" "${container} is ready"
                break
            fi
            
            attempts=$((attempts+1))
            sleep 2
            
            if [ $attempts -eq 30 ]; then
                log "ERROR" "${container} failed to start properly"
                docker logs $container
                exit 1
            fi
        done
    done
}
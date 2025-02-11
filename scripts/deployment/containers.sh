# DIVE25/scripts/deployment/containers.sh

# This script manages container deployment and lifecycle operations for the DIVE25 platform.
# It handles container creation, health checks, scaling, and cleanup for both
# development and production environments.

verify_directory_structure() {
    log "INFO" "Verifying directory structure"

    local required_files=(
        "docker/docker-compose.yml"
        "docker/docker-compose.${environment}.yml"
    )

    for file in "${required_files[@]}"; do
        if [[ ! -f "${SCRIPT_DIR}/${file}" ]]; then
            log "ERROR" "Required file not found: ${file}"
            log "INFO" "Please ensure all required files are in place before deployment"
            log "INFO" "Expected location: ${SCRIPT_DIR}/${file}"
            exit 1
        fi
    done
}

check_docker_auth() {
    log "INFO" "Checking Docker authentication status"
    
    if ! docker info >/dev/null 2>&1; then
        log "ERROR" "Docker daemon is not running"
        exit 1
    fi

    # Check if we can pull a simple public image
    if ! docker pull hello-world >/dev/null 2>&1; then
        log "WARN" "Unable to pull Docker images. Attempting to log in..."
        
        # Try docker login if needed
        if ! docker login; then
            log "ERROR" "Failed to authenticate with Docker Hub"
            exit 1
        fi
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
        # Ensure proper permissions
        chmod 600 ~/.docker/config.json
        
        # Set up Docker credential helper
        mkdir -p ~/Library/Containers/com.docker.docker/Data/credentials
        chmod 700 ~/Library/Containers/com.docker.docker/Data/credentials
    else
        # Linux configuration
        cat > ~/.docker/config.json << EOL
{
    "experimental": "enabled",
    "features": {
        "buildkit": true
    }
}
EOL
    fi
    chmod 600 ~/.docker/config.json

    # Create .env file directory with proper permissions
    sudo mkdir -p "${SCRIPT_DIR}/docker"
    sudo chown $(whoami) "${SCRIPT_DIR}/docker"
}

deploy_docker_containers() {
    local environment=$1
    
    log "INFO" "Beginning container deployment for ${environment}"

    # Force non-root execution on MacOS
    if [[ "$(uname)" == "Darwin" && $EUID -eq 0 ]]; then
        log "ERROR" "On MacOS, please run this script as a regular user, not with sudo"
        exit 1
    fi

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

    # Set environment variables
    export COMPOSE_PROJECT_NAME="dive25"
    export DOCKER_BUILDKIT=1
    export COMPOSE_DOCKER_CLI_BUILD=1
    
    # Ensure Prometheus config directory exists
    sudo mkdir -p "${SCRIPT_DIR}/docker/monitoring/prometheus"
    sudo cp "${SCRIPT_DIR}/config/prometheus.yml" "${SCRIPT_DIR}/docker/monitoring/prometheus/"
    sudo chown -R $(whoami) "${SCRIPT_DIR}/docker/monitoring"

    # Create .env file for Docker Compose with proper permissions
    sudo mkdir -p "${SCRIPT_DIR}/docker"
    cat << EOL | sudo tee "${SCRIPT_DIR}/docker/.env" > /dev/null
PING_IDENTITY_DEVOPS_USER=${PING_IDENTITY_DEVOPS_USER}
PING_IDENTITY_DEVOPS_KEY=${PING_IDENTITY_DEVOPS_KEY}
SERVER_PROFILE_URL=https://${PING_IDENTITY_DEVOPS_USER}:${PING_IDENTITY_DEVOPS_KEY}@github.com/your-org/dive25.git
SERVER_PROFILE_BRANCH=main
COMPOSE_PROJECT_NAME=dive25
EOL
    sudo chown $(whoami) "${SCRIPT_DIR}/docker/.env"
    chmod 600 "${SCRIPT_DIR}/docker/.env"

    # Stop and remove existing containers
    docker-compose --project-directory "${SCRIPT_DIR}/docker" \
        -f "${SCRIPT_DIR}/docker/docker-compose.yml" \
        -f "${SCRIPT_DIR}/docker/docker-compose.${environment}.yml" \
        down --remove-orphans

# Docker authentication
docker logout
sleep 2
echo "${PING_IDENTITY_DEVOPS_KEY}" | docker login -u "${PING_IDENTITY_DEVOPS_USER}" --password-stdin docker.io

if [ $? -ne 0 ]; then
    log "ERROR" "Failed to authenticate with Docker Hub. Check your Ping Identity DevOps credentials."
    exit 1
fi

    # Pull and start containers
    if [[ "$(uname)" == "Darwin" ]]; then
        # MacOS: run without sudo
        DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker-compose \
            --project-directory "${SCRIPT_DIR}/docker" \
            -f "${SCRIPT_DIR}/docker/docker-compose.yml" \
            -f "${SCRIPT_DIR}/docker/docker-compose.${environment}.yml" \
            pull

        DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker-compose \
            --project-directory "${SCRIPT_DIR}/docker" \
            -f "${SCRIPT_DIR}/docker/docker-compose.yml" \
            -f "${SCRIPT_DIR}/docker/docker-compose.${environment}.yml" \
            up -d
    else
        # Linux: use sudo if needed
        sudo -E DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker-compose \
            --project-directory "${SCRIPT_DIR}/docker" \
            -f "${SCRIPT_DIR}/docker/docker-compose.yml" \
            -f "${SCRIPT_DIR}/docker/docker-compose.${environment}.yml" \
            pull

        sudo -E DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker-compose \
            --project-directory "${SCRIPT_DIR}/docker" \
            -f "${SCRIPT_DIR}/docker/docker-compose.yml" \
            -f "${SCRIPT_DIR}/docker/docker-compose.${environment}.yml" \
            up -d
    fi

    # Check if deployment was successful
    if [ $? -ne 0 ]; then
        log "ERROR" "Failed to deploy containers. Checking Docker logs..."
        docker-compose --project-directory "${SCRIPT_DIR}/docker" \
            -f "${SCRIPT_DIR}/docker/docker-compose.yml" \
            -f "${SCRIPT_DIR}/docker/docker-compose.${environment}.yml" \
            logs
        exit 1
    fi

    verify_directory_structure

    # First, we validate the environment has all necessary resources
    validate_container_requirements "$environment"
    
    # Handle any existing containers gracefully
    handle_existing_containers "$environment"
    
    # Deploy the core infrastructure containers
    deploy_core_containers "$environment"
    
    # Deploy the federation services
    deploy_federation_services "$environment"
    
    # Verify the deployment
    verify_container_deployment "$environment"
}

validate_container_requirements() {
    local environment=$1
    
    log "INFO" "Validating container deployment requirements"
    
    # We ensure all required Docker images are available
    local required_images=(
        "pingidentity/pingfederate:12.2.0-latest"
        "pingidentity/pingaccess:8.2.0-latest"
        "pingidentity/pingdirectory:10.2.0.0-latest"
    )
    
    for image in "${required_images[@]}"; do
        if ! docker image inspect "$image" >/dev/null 2>&1; then
            log "INFO" "Pulling required image: $image"
            if ! docker pull "$image"; then
                log "ERROR" "Failed to pull image: $image"
                exit 1
            fi
        fi
    done
    
    # Validate minimum resource requirements
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

handle_existing_containers() {
    local environment=$1
    
    log "INFO" "Checking for existing containers"
    
    # Get list of our containers
    local existing_containers=$(docker ps -a --filter "label=com.dive25.environment=${environment}" --format "{{.Names}}")
    
    if [ ! -z "$existing_containers" ]; then
        log "INFO" "Found existing containers. Performing graceful shutdown"
        
        # Gracefully stop each container
        for container in $existing_containers; do
            log "INFO" "Stopping container: $container"
            docker stop -t 30 "$container" || {
                log "WARN" "Failed to stop container gracefully: $container"
                docker kill "$container"
            }
        done
        
        # Remove stopped containers
        docker container prune -f --filter "label=com.dive25.environment=${environment}"
    fi
}

deploy_core_containers() {
    local environment=$1
    
    log "INFO" "Deploying core infrastructure containers"
    
    # Set environment-specific compose file
    local compose_file="${SCRIPT_DIR}/docker/docker-compose.yml"
    local env_compose_file="${SCRIPT_DIR}/docker/docker-compose.${environment}.yml"
    
    # Deploy using docker-compose
    if ! docker-compose -f "$compose_file" -f "$env_compose_file" up -d; then
        log "ERROR" "Failed to deploy core containers"
        exit 1
    fi
    
    # Wait for core services to be healthy
    wait_for_core_services
}

deploy_federation_services() {
    local environment=$1
    
    log "INFO" "Deploying federation services"
    
    # Configure PingFederate
    docker exec pingfederate sh -c "
        cp /opt/in/instance/server/default/conf/* /opt/out/instance/server/default/conf/ &&
        /opt/out/instance/bin/run.sh -c"
    
    # Configure PingAccess
    docker exec pingaccess sh -c "
        cp /opt/in/instance/conf/* /opt/out/instance/conf/ &&
        /opt/out/instance/bin/run.sh -c"
    
    # Initialize PingDirectory
    docker exec pingdirectory sh -c "
        /opt/out/instance/bin/manage-profile setup"
}

wait_for_core_services() {
    log "INFO" "Waiting for core services to be ready"
    
    local services=("pingfederate" "pingaccess" "pingdirectory")
    local timeout=300  # 5 minutes timeout
    local interval=10  # Check every 10 seconds
    
    for service in "${services[@]}"; do
        local elapsed=0
        while [ $elapsed -lt $timeout ]; do
            if docker exec $service /opt/out/instance/bin/status.sh > /dev/null 2>&1; then
                log "INFO" "$service is ready"
                break
            fi
            
            elapsed=$((elapsed + interval))
            if [ $elapsed -eq $timeout ]; then
                log "ERROR" "Timeout waiting for $service to be ready"
                exit 1
            fi
            
            sleep $interval
        done
    done
}

verify_container_deployment() {
    local environment=$1
    
    log "INFO" "Verifying container deployment"
    
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

# Function to scale services if needed
scale_containers() {
    local environment=$1
    local service=$2
    local replicas=$3
    
    if [[ "$environment" == "prod" ]]; then
        log "INFO" "Scaling $service to $replicas replicas"
        kubectl scale deployment $service --replicas=$replicas -n dive25
    else
        log "WARN" "Scaling not supported in development environment"
    fi
}
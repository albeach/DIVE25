# DIVE25/scripts/deployment/containers.sh

# This script manages container deployment and lifecycle operations for the DIVE25 platform.
# It handles container creation, health checks, scaling, and cleanup for both
# development and production environments.

deploy_docker_containers() {
    local environment=$1
    
    log "INFO" "Beginning container deployment for ${environment} environment"

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
    # Check available disk space
    local available_space=$(df -P . | awk 'NR==2 {print $4}')
    if [ "$available_space" -lt 10485760 ]; then  # 10GB in KB
        log "ERROR" "Insufficient disk space. At least 10GB required"
        exit 1
    fi
    
    # Check available memory
    local available_memory=$(free -m | awk 'NR==2 {print $7}')
    if [ "$available_memory" -lt 4096 ]; then  # 4GB in MB
        log "ERROR" "Insufficient memory. At least 4GB required"
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
# DIVE25/scripts/deployment/profiles.sh

# This script handles the deployment of server profiles for PingFederate,
# PingAccess, and PingDirectory. It includes configuration management
# and validation for both development and production environments.

deploy_server_profiles() {
    local environment=$1
    
    log "INFO" "Deploying server profiles for ${environment}"
    
    # Validate profile configurations before deployment
    validate_server_profiles "$environment"
    
    # Deploy profiles based on environment
    if [[ "$environment" == "prod" ]]; then
        deploy_production_profiles
    else
        deploy_development_profiles
    fi
}

validate_server_profiles() {
    local environment=$1
    
    log "INFO" "Validating server profiles"
    
    # Verify required files exist
    local required_files=(
        "server-profiles/pingfederate/instance/server/default/data/ping-ssl-client-trust-cas.jks"
        "server-profiles/pingfederate/instance/server/default/data/pingfederate-admin-api/api-docs/swagger.json"
        "server-profiles/pingaccess/instance/conf/pa.jwk"
    )
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "${SCRIPT_DIR}/${file}" ]]; then
            log "ERROR" "Required file ${file} is missing"
            exit 1
        fi
    done
    
    # Validate XML configurations
    validate_xml_configs
    
    # Validate OAuth configurations
    validate_oauth_configs
}

deploy_production_profiles() {
    log "INFO" "Deploying production server profiles"
    
    # Apply production-specific configurations
    apply_production_configurations
    
    # Deploy profiles to containers
    deploy_profiles_to_containers "prod"
    
    # Verify deployment
    verify_profile_deployment "prod"
}

deploy_development_profiles() {
    log "INFO" "Deploying development server profiles"
    
    # Apply development-specific configurations
    apply_development_configurations
    
    # Deploy profiles to containers
    deploy_profiles_to_containers "dev"
    
    # Verify deployment
    verify_profile_deployment "dev"
}

deploy_profiles_to_containers() {
    local environment=$1
    
    # Deploy PingFederate profiles
    log "INFO" "Deploying PingFederate profiles"
    docker exec pingfederate sh -c \
        "cp -r /opt/in/instance/server/default/conf/* /opt/out/instance/server/default/conf/"
    
    # Deploy PingAccess profiles
    log "INFO" "Deploying PingAccess profiles"
    docker exec pingaccess sh -c \
        "cp -r /opt/in/instance/conf/* /opt/out/instance/conf/"
    
    # Deploy PingDirectory profiles
    log "INFO" "Deploying PingDirectory profiles"
    docker exec pingdirectory sh -c \
        "cp -r /opt/in/instance/* /opt/out/instance/"
}

verify_profile_deployment() {
    local environment=$1
    
    # Verify PingFederate configuration
    if ! docker exec pingfederate /opt/out/instance/bin/run.sh -t > /dev/null; then
        log "ERROR" "PingFederate configuration test failed"
        exit 1
    fi
    
    # Verify PingAccess configuration
    if ! docker exec pingaccess /opt/out/instance/bin/run.sh -t > /dev/null; then
        log "ERROR" "PingAccess configuration test failed"
        exit 1
    fi
    
    # Verify PingDirectory configuration
    if ! docker exec pingdirectory /opt/out/instance/bin/status.sh; then
        log "ERROR" "PingDirectory configuration test failed"
        exit 1
    fi
    
    log "INFO" "Server profile deployment verified successfully"
}
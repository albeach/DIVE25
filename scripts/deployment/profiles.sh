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

validate_xml_configs() {
    log "INFO" "Validating XML configurations"
    
    local xml_files=(
        $(find "${SCRIPT_DIR}/server-profiles" -name "*.xml")
    )
    
    for xml_file in "${xml_files[@]}"; do
        if ! xmllint --noout "$xml_file" 2>/dev/null; then
            log "ERROR" "Invalid XML in file: $xml_file"
            exit 1
        fi
    done
}

validate_oauth_configs() {
    log "INFO" "Validating OAuth configurations"
    
    # Check OAuth client configurations
    local oauth_config="${SCRIPT_DIR}/server-profiles/pingfederate/instance/server/default/data/oauth-clients/0"
    if [[ -d "$oauth_config" ]]; then
        if ! jq -e . "$oauth_config/client.json" >/dev/null 2>&1; then
            log "ERROR" "Invalid OAuth client configuration"
            exit 1
        fi
    fi
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

apply_production_configurations() {
    log "INFO" "Applying production configurations"
    
    # Wait for containers to be ready before applying configurations
    "${SCRIPT_DIR}/scripts/wait-for-it.sh" localhost:9999 -t 120
    
    # Apply PingFederate production configurations
    local pf_config_dir="${SCRIPT_DIR}/server-profiles/pingfederate/instance/server/default/conf"
    if [[ -f "${pf_config_dir}/production-config.xml" ]]; then
        docker exec pingfederate sh -c "cp /opt/in/instance/server/default/conf/production-config.xml /opt/out/instance/server/default/conf/config.xml"
    fi
    
    # Apply PingAccess production configurations
    local pa_config_dir="${SCRIPT_DIR}/server-profiles/pingaccess/instance/conf"
    if [[ -f "${pa_config_dir}/production-pa.jwk" ]]; then
        docker exec pingaccess sh -c "cp /opt/in/instance/conf/production-pa.jwk /opt/out/instance/conf/pa.jwk"
    fi
}

apply_development_configurations() {
    log "INFO" "Applying development configurations"
    
    # Wait for containers to be ready before applying configurations
    "${SCRIPT_DIR}/scripts/wait-for-it.sh" localhost:9999 -t 120
    
    # Apply PingFederate development configurations
    local pf_config_dir="${SCRIPT_DIR}/server-profiles/pingfederate/instance/server/default/conf"
    if [[ -f "${pf_config_dir}/development-config.xml" ]]; then
        docker exec pingfederate sh -c "cp /opt/in/instance/server/default/conf/development-config.xml /opt/out/instance/server/default/conf/config.xml"
    fi
    
    # Apply PingAccess development configurations
    local pa_config_dir="${SCRIPT_DIR}/server-profiles/pingaccess/instance/conf"
    if [[ -f "${pa_config_dir}/development-pa.jwk" ]]; then
        docker exec pingaccess sh -c "cp /opt/in/instance/conf/development-pa.jwk /opt/out/instance/conf/pa.jwk"
    fi
}

deploy_profiles_to_containers() {
    local environment=$1
    
    # Wait for containers to be ready
    "${SCRIPT_DIR}/scripts/wait-for-it.sh" localhost:1389 -t 120
    "${SCRIPT_DIR}/scripts/wait-for-it.sh" localhost:9999 -t 120
    "${SCRIPT_DIR}/scripts/wait-for-it.sh" localhost:9000 -t 120
    
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
    
    log "INFO" "Verifying profile deployment"
    
    # Wait for services to be ready after profile deployment
    "${SCRIPT_DIR}/scripts/wait-for-it.sh" localhost:9999 -t 60
    "${SCRIPT_DIR}/scripts/wait-for-it.sh" localhost:9000 -t 60
    "${SCRIPT_DIR}/scripts/wait-for-it.sh" localhost:1389 -t 60
    
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
    if ! docker exec pingdirectory /opt/out/instance/bin/status.sh > /dev/null; then
        log "ERROR" "PingDirectory configuration test failed"
        exit 1
    fi
    
    log "INFO" "Server profile deployment verified successfully"
}
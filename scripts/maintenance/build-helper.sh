#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${ROOT_DIR}/deploy.sh"

check_node_version() {
    required_version="16.0.0"
    current_version=$(node -v | cut -d'v' -f2)
    
    if [ $(printf '%s\n' "$required_version" "$current_version" | sort -V | head -n1) != "$required_version" ]; then
        log "ERROR" "Node.js version $required_version or higher is required"
        exit 1
    fi
}

optimize_npm() {
    log "INFO" "Optimizing npm configuration..."
    
    # Use npm ci for faster installs
    export npm_config_audit=false
    export npm_config_fund=false
    
    # Set offline preferences and timeout using environment variables
    export npm_config_prefer_offline=true
    export npm_config_fetch_timeout=60000
    export npm_config_fetch_retries=3
}

handle_build_error() {
    local exit_code=$1
    local error_message=$2
    
    if [ $exit_code -ne 0 ]; then
        log "ERROR" "$error_message"
        # Clean up any partial builds
        rm -rf dist
        exit $exit_code
    fi
}

build_with_retries() {
    local max_retries=3
    local retry_count=0
    local environment=$1
    
    while [ $retry_count -lt $max_retries ]; do
        if [ "$environment" = "prod" ]; then
            npm run build:prod
        else
            npm run build:dev
        fi
        
        if [ $? -eq 0 ]; then
            return 0
        fi
        
        retry_count=$((retry_count + 1))
        log "WARN" "Build attempt $retry_count failed, retrying..."
        sleep 2
    done
    
    return 1
}

main() {
    log "INFO" "Running build helper checks..."
    check_node_version
    optimize_npm
    log "INFO" "Build helper checks completed successfully"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main
fi
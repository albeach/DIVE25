#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Debug output
echo "SCRIPT_DIR = ${SCRIPT_DIR}"
echo "ROOT_DIR = ${ROOT_DIR}"

# Source the main deploy script
source "${ROOT_DIR}/deploy.sh"

# Debug output
echo "Attempting to source helper scripts from: ${SCRIPT_DIR}"

# Source the helper scripts from the SCRIPT_DIR
source "${SCRIPT_DIR}/build-helper.sh"
source "${SCRIPT_DIR}/cache-helper.sh"
source "${SCRIPT_DIR}/dep-optimizer.sh"

cleanup() {
    local environment=${1:-"dev"}
    log "INFO" "Starting cleanup process for ${environment} environment..."
    
    # Check Node.js version
    check_node_version
    
    # Check build cache
    if is_cache_valid "$environment"; then
        log "INFO" "Build cache is valid, skipping build"
        return 0
    fi
    
    # Optimize npm
    optimize_npm
    
    # Clean backend
    if [ -d "${ROOT_DIR}/src/backend" ]; then
        log "INFO" "Cleaning backend..."
        cd "${ROOT_DIR}/src/backend"
        
        # Install dependencies if needed
        if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ] || [ package.json -nt node_modules ]; then
            log "INFO" "Installing/updating dependencies..."
            rm -rf node_modules
            rm -f package-lock.json
            npm install
            if [ $? -ne 0 ]; then
                log "ERROR" "Failed to install dependencies"
                exit 1
            fi
            
            # Optimize dependencies
            "${SCRIPT_DIR}/dep-optimizer.sh" "$environment"
        fi
        
        # Run environment-specific build with retries
        if ! build_with_retries "$environment"; then
            log "ERROR" "Build failed after multiple attempts"
            exit 1
        fi
        
        # Update build cache
        update_cache "$environment"
        
        cd - > /dev/null
    fi
    
    log "INFO" "Cleanup completed successfully"
}

# Run cleanup if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    cleanup "$1"
fi
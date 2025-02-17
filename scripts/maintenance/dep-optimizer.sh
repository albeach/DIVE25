#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${ROOT_DIR}/deploy.sh"

check_duplicate_deps() {
    log "INFO" "Checking for duplicate dependencies..."
    if [ -d "node_modules" ]; then
        npm dedupe
        if [ $? -eq 0 ]; then
            log "INFO" "Successfully deduplicated dependencies"
        else
            log "WARN" "Deduplication completed with warnings"
        fi
    else
        log "WARN" "No node_modules directory found"
    fi
}

remove_dev_deps_prod() {
    if [ "$1" = "prod" ]; then
        log "INFO" "Removing development dependencies for production..."
        npm prune --production
        if [ $? -eq 0 ]; then
            log "INFO" "Successfully removed development dependencies"
        else
            log "ERROR" "Failed to remove development dependencies"
            return 1
        fi
    fi
}

optimize_node_modules() {
    local env=$1
    
    log "INFO" "Optimizing node_modules..."
    
    if [ ! -d "node_modules" ]; then
        log "WARN" "No node_modules directory found"
        return 0
    fi
    
    # Remove unnecessary files
    find node_modules -type f \( \
        -name "*.md" -o \
        -name "*.markdown" -o \
        -name "*.ts" -not -name "*.d.ts" -o \
        -name "*.test.js" -o \
        -name "*.spec.js" -o \
        -name "CHANGELOG*" -o \
        -name "README*" -o \
        -name "LICENSE*" \
    \) -delete 2>/dev/null
    
    # Remove test directories
    find node_modules -type d -name "test" -o -name "tests" -exec rm -rf {} + 2>/dev/null
    
    if [ "$env" = "prod" ]; then
        # Remove additional files in production
        find node_modules -type f \( \
            -name "*.map" -o \
            -name "*.gitignore" \
        \) -delete 2>/dev/null
    fi
    
    log "INFO" "Successfully optimized node_modules"
}

main() {
    local env=${1:-"dev"}
    check_duplicate_deps
    remove_dev_deps_prod "$env"
    optimize_node_modules "$env"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$1"
fi
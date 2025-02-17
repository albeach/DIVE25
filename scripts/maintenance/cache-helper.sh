#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${ROOT_DIR}/deploy.sh"

CACHE_DIR="${ROOT_DIR}/.build-cache"
HASH_FILE="${CACHE_DIR}/build-hash"

setup_cache() {
    mkdir -p "${CACHE_DIR}"
    log "INFO" "Build cache directory setup at ${CACHE_DIR}"
}

calculate_build_hash() {
    local env=$1
    find "${ROOT_DIR}/src/backend" \( -name "*.ts" -o -name "*.json" \) -type f -exec sha256sum {} \; | sort | sha256sum | cut -d' ' -f1
}

is_cache_valid() {
    local env=$1
    local current_hash=$(calculate_build_hash "$env")
    
    if [ -f "${HASH_FILE}" ]; then
        local cached_hash=$(cat "${HASH_FILE}")
        if [ "$current_hash" = "$cached_hash" ]; then
            log "INFO" "Build cache is valid"
            return 0
        fi
    fi
    log "INFO" "Build cache needs updating"
    return 1
}

update_cache() {
    local env=$1
    calculate_build_hash "$env" > "${HASH_FILE}"
    log "INFO" "Updated build cache hash"
}

clean_old_cache() {
    local cache_max_age=604800  # 1 week in seconds
    find "${CACHE_DIR}" -type f -mtime +7 -delete
    log "INFO" "Cleaned old cache files"
}

# Initialize cache when sourced
setup_cache

main() {
    setup_cache
    clean_old_cache
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main
fi
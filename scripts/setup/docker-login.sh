#!/bin/bash

handle_docker_login() {
    # Clear any existing credentials
    docker logout >/dev/null 2>&1

    # Attempt login
    if ! echo "${PING_IDENTITY_DEVOPS_KEY}" | docker login -u "${PING_IDENTITY_DEVOPS_USER}" --password-stdin; then
        log "ERROR" "Failed to authenticate with Docker Hub"
        log "INFO" "Please ensure PING_IDENTITY_DEVOPS_USER and PING_IDENTITY_DEVOPS_KEY are set correctly"
        exit 1
    fi
}
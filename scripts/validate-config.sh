#!/bin/bash

# Configuration requirements per environment
declare -A DEV_REQUIRED=(
    ["DB_USER"]="Database username"
    ["DB_PASSWORD"]="Database password"
    ["DB_NAME"]="Database name"
    ["JWT_SECRET"]="JWT secret key"
)

declare -A STAGING_REQUIRED=(
    ["DB_USER"]="Database username"
    ["DB_PASSWORD"]="Database password"
    ["DB_NAME"]="Database name"
    ["JWT_SECRET"]="JWT secret key"
    ["REDIS_PASSWORD"]="Redis password"
    ["API_KEY"]="API key for external services"
    ["MONITORING_TOKEN"]="Monitoring service token"
)

declare -A PROD_REQUIRED=(
    ["DB_USER"]="Database username"
    ["DB_PASSWORD"]="Database password"
    ["DB_NAME"]="Database name"
    ["JWT_SECRET"]="JWT secret key"
    ["REDIS_PASSWORD"]="Redis password"
    ["API_KEY"]="API key for external services"
    ["MONITORING_TOKEN"]="Monitoring service token"
    ["SSL_CERT_PATH"]="Path to SSL certificate"
    ["SSL_KEY_PATH"]="Path to SSL private key"
)

# Function to validate environment variables
validate_env() {
    local env=$1
    local missing=()
    local invalid=()
    
    case $env in
        dev)
            required=("${!DEV_REQUIRED[@]}")
            ;;
        staging)
            required=("${!STAGING_REQUIRED[@]}")
            ;;
        prod)
            required=("${!PROD_REQUIRED[@]}")
            ;;
        *)
            echo "Invalid environment: $env"
            return 1
            ;;
    esac
    
    # Check for required variables
    for var in "${required[@]}"; do
        if [[ -z "${!var}" ]]; then
            missing+=("$var")
        fi
    done
    
    # Validate specific formats
    if [[ ! -z "$JWT_SECRET" && ${#JWT_SECRET} -lt 32 ]]; then
        invalid+=("JWT_SECRET (must be at least 32 characters)")
    fi
    
    if [[ ! -z "$DB_PASSWORD" && ${#DB_PASSWORD} -lt 8 ]]; then
        invalid+=("DB_PASSWORD (must be at least 8 characters)")
    fi
    
    # Report any issues
    if [[ ${#missing[@]} -gt 0 || ${#invalid[@]} -gt 0 ]]; then
        echo "Configuration validation failed for $env environment:"
        
        if [[ ${#missing[@]} -gt 0 ]]; then
            echo "Missing required variables:"
            for var in "${missing[@]}"; do
                echo "- $var (${DEV_REQUIRED[$var]})"
            done
        fi
        
        if [[ ${#invalid[@]} -gt 0 ]]; then
            echo "Invalid values:"
            for var in "${invalid[@]}"; do
                echo "- $var"
            done
        fi
        return 1
    fi
    
    return 0
} 
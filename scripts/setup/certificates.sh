# DIVE25/scripts/setup/certificates.sh

# This script handles all certificate-related operations for both development
# and production environments. It manages both self-signed certificates for
# development and Let's Encrypt certificates for production.

# Certificate configuration
CERT_DIR="${SCRIPT_DIR}/certificates"
DEV_DOMAIN="dive25.local"
PROD_DOMAIN="dive25.com"
CERT_EMAIL="admin@dive25.com"

# Create and set permissions for certificate directories
setup_certificate_directories() {
    # Create main certificate directory if it doesn't exist
    mkdir -p "${CERT_DIR}"
    chmod 755 "${CERT_DIR}"

    # Create and set permissions for environment-specific directories
    for env in dev prod; do
        mkdir -p "${CERT_DIR}/${env}"
        chmod 755 "${CERT_DIR}/${env}"
    done
}

# Call this function before any certificate operations
setup_certificate_directories

setup_development_certificates() {
    log "INFO" "Setting up development certificates..."
    
    local dev_cert_dir="${CERT_DIR}/dev"
    mkdir -p "$dev_cert_dir"
    
    # Generate CA key and certificate if they don't exist
    if [[ ! -f "${dev_cert_dir}/ca.key" ]]; then
        openssl genrsa -out "${dev_cert_dir}/ca.key" 4096
        
        openssl req -x509 -new -nodes \
            -key "${dev_cert_dir}/ca.key" \
            -sha256 -days 1024 \
            -out "${dev_cert_dir}/ca.crt" \
            -subj "/C=US/ST=VA/L=Default/O=DIVE25/CN=${DEV_DOMAIN}" \
            -config "${SCRIPT_DIR}/openssl.cnf" \
            -extensions v3_ca
    fi
    
    # Generate server key and CSR
    openssl genrsa -out "${dev_cert_dir}/server.key" 2048
    
    openssl req -new \
        -key "${dev_cert_dir}/server.key" \
        -out "${dev_cert_dir}/server.csr" \
        -config "${SCRIPT_DIR}/openssl.cnf"
    
    # Sign the certificate
    openssl x509 -req \
        -in "${dev_cert_dir}/server.csr" \
        -CA "${dev_cert_dir}/ca.crt" \
        -CAkey "${dev_cert_dir}/ca.key" \
        -CAcreateserial \
        -out "${dev_cert_dir}/server.crt" \
        -days 365 \
        -sha256 \
        -extfile "${SCRIPT_DIR}/openssl.cnf" \
        -extensions v3_req
    
    # Create PKCS12 file for Java keystores
    openssl pkcs12 -export \
        -in "${dev_cert_dir}/server.crt" \
        -inkey "${dev_cert_dir}/server.key" \
        -out "${dev_cert_dir}/server.p12" \
        -name dive25 \
        -CAfile "${dev_cert_dir}/ca.crt" \
        -caname root \
        -password pass:2FederateM0re
    
    log "INFO" "Development certificates generated successfully"
}

# First, we'll create a function to detect and set up our environment
setup_certificate_environment() {
    # Detect operating system
    case "$(uname)" in
        "Darwin")
            PACKAGE_MANAGER="brew"
            CERTBOT_INSTALL_CMD="brew install certbot"
            CERTBOT_PATH="/usr/local/bin/certbot"
            ;;
        "Linux")
            # Detect Linux distribution
            if command -v apt-get >/dev/null 2>&1; then
                PACKAGE_MANAGER="apt"
                CERTBOT_INSTALL_CMD="apt-get update && apt-get install -y certbot"
                CERTBOT_PATH="/usr/bin/certbot"
            elif command -v yum >/dev/null 2>&1; then
                PACKAGE_MANAGER="yum"
                CERTBOT_INSTALL_CMD="yum install -y certbot"
                CERTBOT_PATH="/usr/bin/certbot"
            else
                log "ERROR" "Unsupported Linux distribution"
                exit 1
            fi
            ;;
        *)
            log "ERROR" "Unsupported operating system: $(uname)"
            exit 1
            ;;
    esac
}

# Function to install certbot regardless of platform
install_certbot() {
    if ! command -v certbot >/dev/null 2>&1; then
        log "INFO" "Installing certbot using ${PACKAGE_MANAGER}..."
        eval "sudo ${CERTBOT_INSTALL_CMD}"
        
        # Verify installation
        if ! command -v certbot >/dev/null 2>&1; then
            log "ERROR" "Failed to install certbot"
            exit 1
        fi
    fi
}

setup_production_certificates() {
    log "INFO" "Setting up production certificates..."
    
    local prod_cert_dir="${CERT_DIR}/prod"
    mkdir -p "$prod_cert_dir"

    # Install certbot if needed
    if ! command -v certbot >/dev/null 2>&1; then
        log "INFO" "Installing certbot..."
        if [[ "$(uname)" == "Darwin" ]]; then
            brew install certbot
        else
            sudo apt-get update
            sudo apt-get install -y certbot
        fi
    fi

    log "INFO" "Generating Let's Encrypt certificates..."

    # Always use sudo for certbot, regardless of platform
    sudo certbot certonly \
        --manual \
        --preferred-challenges dns \
        -d "${PROD_DOMAIN}" \
        -d "*.${PROD_DOMAIN}" \
        --agree-tos \
        --email "${CERT_EMAIL}" \
        --server https://acme-v02.api.letsencrypt.org/directory

    if [ $? -eq 0 ]; then
        log "INFO" "Let's Encrypt certificates generated successfully"
        
        # Create PKCS12 file for Java keystores
        sudo openssl pkcs12 -export \
            -in "/etc/letsencrypt/live/${PROD_DOMAIN}/fullchain.pem" \
            -inkey "/etc/letsencrypt/live/${PROD_DOMAIN}/privkey.pem" \
            -out "${prod_cert_dir}/certificate.p12" \
            -name dive25 \
            -password pass:2FederateM0re
        
        # Copy certificates to appropriate locations
        sudo mkdir -p "${prod_cert_dir}"
        sudo cp -r "/etc/letsencrypt/live/${PROD_DOMAIN}"/* "${prod_cert_dir}/"
        
        # Set correct permissions
        sudo chown -R $(whoami) "${prod_cert_dir}"
        chmod -R 600 "${prod_cert_dir}"
        
        # Setup auto-renewal
        setup_certificate_renewal
        
        log "INFO" "Certificate setup completed successfully"
    else
        log "ERROR" "Let's Encrypt certificate generation failed"
        exit 1
    fi
}

# Add new function to set up DNS credentials
setup_dns_credentials() {
    log "INFO" "Setting up DNS credentials..."
    
    # Create credentials directory
    mkdir -p ~/.aws
    
    # Create credentials file (example for AWS Route 53)
    cat > ~/.aws/credentials << EOL
[default]
aws_access_key_id = your_access_key
aws_secret_access_key = your_secret_key
EOL

    chmod 600 ~/.aws/credentials
}

setup_certificate_renewal() {
    log "INFO" "Setting up certificate auto-renewal..."
    
    # Create renewal hook script
    sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
    
    sudo bash -c "cat > /etc/letsencrypt/renewal-hooks/deploy/dive25-deploy.sh" << 'EOL'
#!/bin/bash

# Convert renewed certificates to PKCS12
openssl pkcs12 -export \
    -in $RENEWED_LINEAGE/fullchain.pem \
    -inkey $RENEWED_LINEAGE/privkey.pem \
    -out $RENEWED_LINEAGE/certificate.p12 \
    -name dive25 \
    -password pass:2FederateM0re

# Copy to deployment directory
cp $RENEWED_LINEAGE/* /opt/dive25/certificates/prod/

# Restart services
kubectl rollout restart deployment/pingfederate -n dive25
kubectl rollout restart deployment/pingaccess -n dive25
EOL

    sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/dive25-deploy.sh
    
    # Add renewal to crontab
    (sudo crontab -l 2>/dev/null; echo "0 0 1 * * /usr/bin/certbot renew --quiet") | sudo crontab -
    
    log "INFO" "Certificate auto-renewal configured successfully"
}

monitor_certificates() {
    local environment=$1
    local domain="${environment}_DOMAIN"
    local cert_dir="${CERT_DIR}/${environment}"
    
    # Check certificate expiration
    local expiry_date
    if [[ "$environment" == "prod" ]]; then
        expiry_date=$(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/${!domain}/fullchain.pem" | cut -d= -f2)
    else
        expiry_date=$(openssl x509 -enddate -noout -in "${cert_dir}/server.crt" | cut -d= -f2)
    fi
    
    local expiry_epoch=$(date -d "$expiry_date" +%s)
    local current_epoch=$(date +%s)
    local days_remaining=$(( ($expiry_epoch - $current_epoch) / 86400 ))
    
    # Alert if certificate is expiring soon
    if [ $days_remaining -le 30 ]; then
        log "WARN" "SSL certificate for ${!domain} will expire in $days_remaining days"
        
        # Send alert to monitoring system
        if [[ "$environment" == "prod" ]]; then
            curl -X POST "http://localhost:9093/api/v1/alerts" \
                -H "Content-Type: application/json" \
                -d '{
                    "labels": {
                        "alertname": "CertificateExpiringSoon",
                        "severity": "warning",
                        "domain": "'${!domain}'",
                        "days_remaining": "'$days_remaining'"
                    },
                    "annotations": {
                        "summary": "SSL Certificate Expiring Soon",
                        "description": "The SSL certificate for '${!domain}' will expire in '$days_remaining' days"
                    }
                }'
        fi
    fi
}
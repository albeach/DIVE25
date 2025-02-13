# DIVE25/scripts/setup/certificates.sh

# This script handles all certificate-related operations for both development
# and production environments. It manages both self-signed certificates for
# development and Let's Encrypt certificates for production.

# Certificate configuration
CERT_DIR="${SCRIPT_DIR}/certificates"
DEV_DOMAIN="dive25.local"
PROD_DOMAIN="dive25.com"
CERT_EMAIL="admin@dive25.com"

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

setup_production_certificates() {
    log "INFO" "Setting up production certificates..."
    
    local prod_cert_dir="${CERT_DIR}/prod"
    mkdir -p "$prod_cert_dir"
    
    # Install certbot if not present
    if ! command -v certbot &> /dev/null; then
        log "INFO" "Installing certbot..."
        apt-get update
        apt-get install -y certbot
    fi
    
    # Generate Let's Encrypt certificates
    certbot certonly \
        --standalone \
        -d "${PROD_DOMAIN}" \
        -d "*.${PROD_DOMAIN}" \
        --agree-tos \
        --email "${CERT_EMAIL}" \
        --preferred-challenges dns-01 \
        --server https://acme-v02.api.letsencrypt.org/directory
    
    if [ $? -eq 0 ]; then
        log "INFO" "Let's Encrypt certificates generated successfully"
        
        # Convert to PKCS12 for PingFederate
        openssl pkcs12 -export \
            -in "/etc/letsencrypt/live/${PROD_DOMAIN}/fullchain.pem" \
            -inkey "/etc/letsencrypt/live/${PROD_DOMAIN}/privkey.pem" \
            -out "${prod_cert_dir}/certificate.p12" \
            -name dive25 \
            -password pass:2FederateM0re
        
        # Setup auto-renewal
        setup_certificate_renewal
    else
        log "ERROR" "Let's Encrypt certificate generation failed"
        exit 1
    fi
}

setup_certificate_renewal() {
    log "INFO" "Setting up certificate auto-renewal..."
    
    # Create renewal hook script
    mkdir -p /etc/letsencrypt/renewal-hooks/deploy
    
    cat > /etc/letsencrypt/renewal-hooks/deploy/dive25-deploy.sh << 'EOL'
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

    chmod +x /etc/letsencrypt/renewal-hooks/deploy/dive25-deploy.sh
    
    # Add renewal to crontab
    (crontab -l 2>/dev/null; echo "0 0 1 * * /usr/bin/certbot renew --quiet") | crontab -
    
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
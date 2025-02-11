# dive25/scripts/letsencrypt-setup.sh

#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
DOMAIN="dive25.com"
EMAIL="admin@dive25.com"
STAGING=0 # Set to 1 for testing

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}"
   exit 1
fi

# Install certbot if not present
if ! command -v certbot &> /dev/null; then
    echo -e "${YELLOW}Installing certbot...${NC}"
    apt-get update
    apt-get install -y certbot
fi

# Generate certificates
generate_cert() {
    local staging_arg=""
    if [[ $STAGING -eq 1 ]]; then
        staging_arg="--staging"
    fi

    echo -e "${YELLOW}Generating Let's Encrypt certificate for ${DOMAIN}...${NC}"
    
    certbot certonly $staging_arg \
        --standalone \
        -d $DOMAIN \
        -d "*.${DOMAIN}" \
        --agree-tos \
        --email $EMAIL \
        --preferred-challenges dns-01 \
        --server https://acme-v02.api.letsencrypt.org/directory

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Certificate generated successfully${NC}"
        
        # Convert certificates to PKCS12 format for PingFederate
        openssl pkcs12 -export \
            -in /etc/letsencrypt/live/${DOMAIN}/fullchain.pem \
            -inkey /etc/letsencrypt/live/${DOMAIN}/privkey.pem \
            -out /etc/letsencrypt/live/${DOMAIN}/certificate.p12 \
            -name dive25 \
            -password pass:2FederateM0re
            
        # Copy certificates to appropriate locations
        mkdir -p /opt/dive25/certificates/prod
        cp /etc/letsencrypt/live/${DOMAIN}/* /opt/dive25/certificates/prod/
        
        # Set correct permissions
        chown -R pingfederate:pingfederate /opt/dive25/certificates/prod
    else
        echo -e "${RED}Certificate generation failed${NC}"
        exit 1
    fi
}

# Setup auto-renewal
setup_renewal() {
    echo -e "${YELLOW}Setting up auto-renewal...${NC}"
    
    # Create renewal hook script
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

# Restart services to pick up new certificates
kubectl rollout restart deployment/pingfederate -n dive25
kubectl rollout restart deployment/pingaccess -n dive25
EOL

    chmod +x /etc/letsencrypt/renewal-hooks/deploy/dive25-deploy.sh
    
    # Add to crontab
    (crontab -l 2>/dev/null; echo "0 0 1 * * /usr/bin/certbot renew --quiet") | crontab -
}

# Main execution
generate_cert
setup_renewal
#!/bin/bash

# Exit on error
set -e

# Check if running in production
if [ "$NODE_ENV" != "production" ]; then
    echo "Generating self-signed certificates for development..."
    
    # Generate self-signed certificates for local development
    mkdir -p ./certs
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout ./certs/privkey.pem \
        -out ./certs/fullchain.pem \
        -subj "/C=US/ST=VA/L=Norfolk/O=Garage de Dive 25/CN=*.dive25.local"
else
    echo "Setting up Let's Encrypt wildcard certificates for production..."
    
    # Install certbot and DNS plugin (using example with Cloudflare - adjust based on your DNS provider)
    apt-get update
    apt-get install -y certbot python3-certbot-dns-cloudflare
    
    # Ensure Cloudflare credentials file exists and is secure
    if [ ! -f /root/.secrets/cloudflare.ini ]; then
        mkdir -p /root/.secrets
        echo "dns_cloudflare_api_token = ${CLOUDFLARE_API_TOKEN}" > /root/.secrets/cloudflare.ini
        chmod 600 /root/.secrets/cloudflare.ini
    fi
    
    # Get wildcard certificate
    certbot certonly \
        --dns-cloudflare \
        --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
        -d dive25.com \
        -d *.dive25.com \
        --email admin@dive25.com \
        --agree-tos \
        --non-interactive \
        --preferred-challenges dns-01 \
        --server https://acme-v02.api.letsencrypt.org/directory
    
    # Set up auto-renewal with DNS challenge
    (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare.ini") | crontab -
    
    echo "Wildcard certificate setup complete for *.dive25.com"
    echo "Don't forget to set up DNS records for your subdomains!"
fi

# Print certificate information if in production
if [ "$NODE_ENV" = "production" ]; then
    echo "Certificate information:"
    certbot certificates
fi 
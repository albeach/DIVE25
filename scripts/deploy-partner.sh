#!/bin/bash

# Exit on error
set -e

# Default values
DIVE25_API_URL="https://api.dive25.com"
CONFIG_FILE="partner-config.json"

# Help message
show_help() {
    echo "DIVE25 Partner IdP Deployment Script"
    echo
    echo "Usage: $0 [OPTIONS]"
    echo
    echo "Options:"
    echo "  -t, --token TOKEN       Partner API token (required)"
    echo "  -n, --name NAME         Partner name (required)"
    echo "  -e, --endpoint URL      IdP endpoint URL (required)"
    echo "  -c, --config FILE       Config file path (default: partner-config.json)"
    echo "  -h, --help             Show this help message"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--token)
            API_TOKEN="$2"
            shift 2
            ;;
        -n|--name)
            PARTNER_NAME="$2"
            shift 2
            ;;
        -e|--endpoint)
            IDP_ENDPOINT="$2"
            shift 2
            ;;
        -c|--config)
            CONFIG_FILE="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$API_TOKEN" ] || [ -z "$PARTNER_NAME" ] || [ -z "$IDP_ENDPOINT" ]; then
    echo "Error: Missing required parameters"
    show_help
    exit 1
fi

# Create partner configuration
cat > "$CONFIG_FILE" << EOF
{
    "name": "$PARTNER_NAME",
    "endpoint": "$IDP_ENDPOINT",
    "apiToken": "$API_TOKEN",
    "healthCheck": {
        "endpoint": "/health",
        "interval": 60,
        "timeout": 5
    },
    "security": {
        "allowedIPs": [],
        "requiredHeaders": [
            "X-Partner-ID",
            "X-Partner-Token"
        ]
    }
}
EOF

# Deploy minimal NGINX configuration
cat > "nginx-partner.conf" << EOF
server {
    listen 80;
    server_name localhost;

    location /health {
        return 200 'healthy\n';
        add_header Content-Type text/plain;
    }

    location / {
        proxy_pass $IDP_ENDPOINT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Partner-ID "$PARTNER_NAME";
        proxy_set_header X-Partner-Token "$API_TOKEN";
    }
}
EOF

# Deploy using Docker
cat > "docker-compose.partner.yml" << EOF
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx-partner.conf:/etc/nginx/conf.d/default.conf
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3
EOF

# Deploy
echo "Deploying Partner IdP configuration..."
docker-compose -f docker-compose.partner.yml up -d

# Register with DIVE25
echo "Registering with DIVE25 platform..."
REGISTER_RESPONSE=$(curl -X POST "$DIVE25_API_URL/api/partners/register" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_TOKEN" \
    -d @"$CONFIG_FILE")

if [ $? -eq 0 ]; then
    echo "Partner IdP deployment successful!"
    echo "Configuration saved to: $CONFIG_FILE"
    echo "Response from DIVE25:"
    echo "$REGISTER_RESPONSE" | jq '.'
else
    echo "Error registering with DIVE25 platform. Please check your configuration."
    exit 1
fi

# Print next steps
echo
echo "Next steps:"
echo "1. Configure your DNS to point to this server"
echo "2. Set up SSL certificates"
echo "3. Monitor your IdP status at: https://dive25.com/partners/status"
echo
echo "For assistance, contact: support@dive25.com" 
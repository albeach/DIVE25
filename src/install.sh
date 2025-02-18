#!/bin/bash

# One-line installation command:
# curl -sSL https://dive25.com/install.sh | bash -s -- --domain your-domain.com --email your-email@domain.com

set -e

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --domain) DOMAIN="$2"; shift ;;
        --email) EMAIL="$2"; shift ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

# Validate required parameters
if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "Usage: curl -sSL https://dive25.com/install.sh | bash -s -- --domain your-domain.com --email your-email@domain.com"
    exit 1
fi

echo "Installing DIVE25..."

# Check system requirements
command -v docker >/dev/null 2>&1 || { echo "Docker is required but not installed. Installing..."; \
    curl -fsSL https://get.docker.com | sh; }
command -v docker-compose >/dev/null 2>&1 || { echo "Docker Compose is required but not installed. Installing..."; \
    curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose && \
    chmod +x /usr/local/bin/docker-compose; }

# Create deployment directory
DEPLOY_DIR="/opt/dive25"
mkdir -p $DEPLOY_DIR
cd $DEPLOY_DIR

# Download latest release
echo "Downloading DIVE25..."
curl -sSL https://github.com/yourusername/dive25/archive/main.tar.gz | tar xz --strip-components=1

# Generate secure passwords
DB_PASS=$(openssl rand -base64 32)
REDIS_PASS=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -base64 64)

# Create configuration
cat > .env.production << EOL
DOMAIN=$DOMAIN
SSL_EMAIL=$EMAIL
DB_USER=dive25_admin
DB_PASSWORD=$DB_PASS
REDIS_PASSWORD=$REDIS_PASS
JWT_SECRET=$JWT_SECRET
MONGODB_URI=mongodb://dive25_admin:$DB_PASS@mongodb:27017/dive25_docs
EOL

# Start services
echo "Starting DIVE25..."
chmod +x backend/start.sh
./backend/start.sh production

# Save credentials
CREDS_FILE="$HOME/dive25_credentials.txt"
cat > $CREDS_FILE << EOL
DIVE25 Credentials (SAVE THESE SECURELY AND DELETE THIS FILE)
==========================================================
Domain: $DOMAIN
Database Password: $DB_PASS
Redis Password: $REDIS_PASS
JWT Secret: $JWT_SECRET
==========================================================
EOL

chmod 600 $CREDS_FILE

echo "
==========================================================
DIVE25 Installation Complete!

Your system is running at: https://$DOMAIN
Credentials saved to: $CREDS_FILE

IMPORTANT: 
1. Save your credentials
2. Delete $CREDS_FILE after saving credentials
3. Access the admin panel at https://$DOMAIN/admin

For support: support@dive25.com
==========================================================
"

# Check deployment
if curl -sSf https://$DOMAIN/api/health > /dev/null; then
    echo "Health check passed! System is running correctly."
else
    echo "Warning: Health check failed. Please check the logs with: docker-compose logs -f"
fi 
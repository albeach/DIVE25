#!/bin/bash

# Exit on any error
set -e

# Parse command line arguments
ENV=${1:-production}  # Default to production if no argument provided
CONFIG_FILE=".env.${ENV}"

echo "Starting NATO Document Management System in $ENV mode..."

# Check Docker
if ! docker info > /dev/null 2>&1; then
    echo "Docker is not running. Please start Docker and try again."
    exit 1
fi

# SSL Certificate setup for production
if [ "$ENV" = "production" ]; then
    echo "Checking SSL certificates..."
    
    # Install certbot if not present
    if ! command -v certbot &> /dev/null; then
        echo "Installing certbot..."
        apt-get update && apt-get install -y certbot
    fi
    
    # Check for existing certificates
    if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
        echo "Obtaining SSL certificate..."
        certbot certonly --standalone \
            --non-interactive \
            --agree-tos \
            --email "${SSL_EMAIL}" \
            --domains "${DOMAIN}" \
            --cert-path "${SSL_CERT_PATH}" \
            --key-path "${SSL_KEY_PATH}"
    fi
    
    # Setup auto-renewal
    (crontab -l 2>/dev/null; echo "0 0,12 * * * certbot renew --quiet") | crontab -
fi

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Creating default $CONFIG_FILE with temporary secure passwords..."
    
    # Generate random passwords
    DB_PASS=$(openssl rand -base64 12)
    REDIS_PASS=$(openssl rand -base64 12)
    KONG_PASS=$(openssl rand -base64 12)
    KEYCLOAK_PASS=$(openssl rand -base64 12)
    API_KEY=$(openssl rand -base64 32)
    JWT_SECRET=$(openssl rand -base64 32)

    # Create config file
    cat > "$CONFIG_FILE" << EOL
# Database Configuration
DB_USER=dive25_admin
DB_PASSWORD=$DB_PASS
DB_NAME=dive25_docs

# MongoDB Configuration
MONGODB_URI=mongodb://dive25_admin:$DB_PASS@mongodb:27017/dive25_docs

# Redis Configuration
REDIS_HOST=redis
REDIS_PASSWORD=$REDIS_PASS

# Kong Configuration
KONG_DB_USER=kong
KONG_DB_PASSWORD=$KONG_PASS
KONG_DATABASE=kong

# Keycloak Configuration
KEYCLOAK_DB_USER=keycloak
KEYCLOAK_DB_PASSWORD=$KEYCLOAK_PASS
KEYCLOAK_DB_NAME=keycloak

# API Configuration
API_KEY=$API_KEY
JWT_SECRET=$JWT_SECRET
EOL

    echo "Created $CONFIG_FILE with secure temporary passwords"
    echo "IMPORTANT: Please save these credentials and update them later:"
    echo "Database Password: $DB_PASS"
    echo "Redis Password: $REDIS_PASS"
    echo "Kong Password: $KONG_PASS"
    echo "Keycloak Password: $KEYCLOAK_PASS"
    echo "API Key: $API_KEY"
fi

# Load environment variables
set -a
source "$CONFIG_FILE"
set +a

# Start services
echo "Starting services..."
docker-compose -f docker-compose.${ENV}.yml up -d

# Wait for services to be healthy
echo "Waiting for services to be ready..."
sleep 10

# Check service health
echo "Checking service health..."
if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "Services are healthy!"
else
    echo "Services failed to start properly. Check logs with: docker-compose logs"
    exit 1
fi

echo "Deployment complete!"

# Check MongoDB
if ! docker-compose exec mongodb mongosh --eval "db.adminCommand('ping')" > /dev/null; then
    echo "MongoDB failed to start properly"
    exit 1
fi

# Check OPA
if ! curl -s http://localhost:8181/health > /dev/null; then
    echo "OPA failed to start properly"
    exit 1
fi

echo "API is running at http://localhost:3000"
echo "Grafana dashboard at http://localhost:3002"
echo "Prometheus metrics at http://localhost:9090"

# Print logs
echo "Recent logs:"
docker-compose logs --tail=50

echo "Setup complete! Use 'docker-compose logs -f' to follow logs"

# DIVE25 Quick Deploy

1. Clone repo
2. Edit backend/.env.production
3. Run: ./backend/start.sh production
4. Save displayed credentials
5. Access at: https://your-domain.com

Requirements:
- Docker & Docker Compose
- Node.js 18+
- 2GB RAM minimum
- Ubuntu 20.04+ recommended 

curl -sSL https://dive25.com/install.sh | bash -s -- --domain your-domain.com --email your-email@domain.com 

# Create and enter directory
mkdir dive25
cd dive25

# Clone the repository directly (more reliable than tar.gz)
git clone https://github.com/yourusername/dive25.git .

# Make scripts executable
chmod +x backend/start.sh
chmod +x install.sh

# Check if all services are running
docker-compose ps

# Check logs for any errors
docker-compose logs -f

# Test the API endpoint
curl https://dive25.com/api/health 

# Check system status
docker-compose ps

# View real-time logs
docker-compose logs -f

# Check SSL certificate
curl -vI https://dive25.com 

# Copy example env file
cp backend/.env.example backend/.env.production

# Edit the environment file with your values
nano backend/.env.production 

# Run the start script
./backend/start.sh production 

# 1. Check Docker status
docker info

# 2. Pull required images
docker-compose pull

# 3. Build the application
docker-compose build

# 4. Start services
docker-compose up -d

# 5. Check status
docker-compose ps 

docker --version
docker-compose --version 

# Add this function after the existing functions
load_ssl_certificates() {
    local env_type=$1
    local cert_dir="/certificates/prod"
    local nginx_dir="/etc/nginx/certs"

    if [ "$env_type" = "staging" ] && [ -d "$cert_dir" ]; then
        echo "Loading pre-existing SSL certificates from ${cert_dir}..."
        
        # Create nginx certs directory if it doesn't exist
        mkdir -p $nginx_dir

        # Check for required certificate files
        if [ -f "${cert_dir}/fullchain.pem" ] && [ -f "${cert_dir}/privkey.pem" ]; then
            # Copy certificates to nginx directory
            cp "${cert_dir}/fullchain.pem" "${nginx_dir}/fullchain.pem"
            cp "${cert_dir}/privkey.pem" "${nginx_dir}/privkey.pem"
            
            # Set proper permissions
            chmod 644 "${nginx_dir}/fullchain.pem"
            chmod 600 "${nginx_dir}/privkey.pem"
            
            echo -e "${GREEN}SSL certificates loaded successfully${NC}"
            return 0
        else
            echo -e "${YELLOW}Warning: Required certificate files not found in ${cert_dir}${NC}"
            echo "Falling back to self-signed certificates..."
            return 1
        fi
    fi
    return 1
}

# Add this function to handle SSL certificate setup
setup_ssl_certificates() {
    local env_type=$1
    local domain=$2
    local email=$3

    echo "Setting up SSL certificates..."

    # Create directories with proper permissions
    sudo mkdir -p /etc/letsencrypt
    sudo mkdir -p /var/log/letsencrypt
    sudo mkdir -p /var/lib/letsencrypt

    if [ "$env_type" = "production" ]; then
        echo "Obtaining Let's Encrypt SSL certificate..."
        # Run certbot with proper permissions
        sudo certbot certonly \
            --standalone \
            --agree-tos \
            --non-interactive \
            --email "$email" \
            --domains "$domain" \
            --logs-dir /var/log/letsencrypt \
            --config-dir /etc/letsencrypt \
            --work-dir /var/lib/letsencrypt

        # Copy certificates to our application directory
        sudo mkdir -p src/backend/certificates/prod
        sudo cp /etc/letsencrypt/live/$domain/fullchain.pem src/backend/certificates/prod/
        sudo cp /etc/letsencrypt/live/$domain/privkey.pem src/backend/certificates/prod/
        
        # Set proper permissions
        sudo chown -R $USER:$USER src/backend/certificates/prod
        sudo chmod 644 src/backend/certificates/prod/fullchain.pem
        sudo chmod 600 src/backend/certificates/prod/privkey.pem
    fi
}

# Modify the case statement in the main script
case $choice in
    2) # Staging
        ENV="staging"
        create_env_file "staging"
        
        # Try to load existing certificates
        if load_ssl_certificates "staging"; then
            echo "Using production SSL certificates for staging"
        else
            echo "Generating self-signed certificates for staging"
            # Generate self-signed cert logic here
        fi
        
        docker-compose -f docker-compose.staging.yml up -d
        load_test_data
        ;;
esac 

# Add user to proper groups
sudo usermod -aG docker $USER
sudo usermod -aG ssl-cert $USER

# Create directories with proper permissions
sudo mkdir -p /etc/letsencrypt /var/log/letsencrypt /var/lib/letsencrypt
sudo chown -R $USER:$USER /etc/letsencrypt /var/log/letsencrypt /var/lib/letsencrypt 
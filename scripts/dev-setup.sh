#!/bin/bash
set -e

# Install dependencies
echo "Installing dependencies..."
npm install -g concurrently
cd src/frontend && npm install
cd ../backend && npm install

# Create local env files
echo "Setting up environment files..."
cat > .env.development << EOL
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dive25_dev"
MONGODB_URI="mongodb://localhost:27017/dive25_dev"

# Keycloak
KEYCLOAK_URL="http://localhost:8080"
KEYCLOAK_REALM="dive25-dev"
KEYCLOAK_CLIENT_ID="dive25-local"
KEYCLOAK_CLIENT_SECRET="your-dev-secret"

# Server
PORT=6969
NODE_ENV="development"
EOL

# Start development services
echo "Starting development services..."
docker-compose -f docker-compose.dev.yml up -d

# Run database migrations
echo "Running database migrations..."
npx prisma migrate dev

# Start development servers
echo "Starting development servers..."
concurrently \
    "cd src/frontend && npm run dev" \
    "cd src/backend && npm run dev" 
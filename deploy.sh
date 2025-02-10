#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check for environment argument
if [ -z "$1" ]; then
    echo -e "${RED}Please specify environment (dev or prod)${NC}"
    echo "Usage: $0 {dev|prod}"
    exit 1
fi

ENV=$1
DOMAIN=${ENV}

echo -e "${GREEN}Starting DIVE25 deployment for ${ENV} environment${NC}"

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}Docker is not running. Please start Docker first.${NC}"
        exit 1
    fi
}

# Function to wait for container readiness
wait_for_container() {
    local container=$1
    local max_attempts=30
    local attempt=1

    echo -e "${YELLOW}Waiting for ${container} to be ready...${NC}"
    while [ $attempt -le $max_attempts ]; do
        if docker container inspect -f '{{.State.Running}}' $container 2>/dev/null | grep -q "true"; then
            echo -e "${GREEN}${container} is ready${NC}"
            return 0
        fi
        attempt=$((attempt+1))
        sleep 2
    done
    echo -e "${RED}${container} failed to start properly${NC}"
    return 1
}

# Navigate to project directory
cd dive25

# Setup certificates
echo -e "${YELLOW}Generating certificates...${NC}"
./scripts/setup-certs.sh $ENV

# Check Docker status
check_docker

# Start containers
cd docker
echo -e "${YELLOW}Stopping any existing containers...${NC}"
docker-compose down

echo -e "${YELLOW}Starting containers...${NC}"
docker-compose up -d

# Return to project directory
cd ..

# Wait for containers to be ready
wait_for_container "pingfederate"
wait_for_container "pingaccess"
wait_for_container "pingdirectory"

# Import certificates to PingFederate
echo -e "${YELLOW}Importing certificates to PingFederate...${NC}"
docker exec pingfederate mkdir -p /opt/out/instance/server/default/conf
docker exec pingfederate keytool -importkeystore \
    -srckeystore /opt/in/certificates/${ENV}/server.p12 \
    -srcstoretype PKCS12 \
    -srcstorepass 2FederateM0re \
    -destkeystore /opt/out/instance/server/default/conf/keystore.jks \
    -deststoretype JKS \
    -deststorepass 2FederateM0re \
    -noprompt

# Import certificates to PingAccess
echo -e "${YELLOW}Importing certificates to PingAccess...${NC}"
docker exec pingaccess mkdir -p /opt/out/instance/conf
docker exec pingaccess keytool -importkeystore \
    -srckeystore /opt/in/certificates/${ENV}/server.p12 \
    -srcstoretype PKCS12 \
    -srcstorepass 2FederateM0re \
    -destkeystore /opt/out/instance/conf/keystore \
    -deststorepass 2Access \
    -noprompt

# Deploy server profiles
echo -e "${YELLOW}Deploying server profiles...${NC}"
./server-profiles/deploy-profiles.sh

# Verify deployment
echo -e "${YELLOW}Verifying deployment...${NC}"
sleep 10

# Check PingFederate
if curl -sk https://localhost:9999/pingfederate/app > /dev/null; then
    echo -e "${GREEN}PingFederate is accessible${NC}"
else
    echo -e "${RED}PingFederate verification failed${NC}"
fi

# Check PingAccess
if curl -sk https://localhost:9000 > /dev/null; then
    echo -e "${GREEN}PingAccess is accessible${NC}"
else
    echo -e "${RED}PingAccess verification failed${NC}"
fi

# Check PingDirectory
if ldapsearch -H ldaps://localhost:1636 -b "cn=config" -s base "objectclass=*" > /dev/null 2>&1; then
    echo -e "${GREEN}PingDirectory is accessible${NC}"
else
    echo -e "${RED}PingDirectory verification failed${NC}"
fi

echo -e "${GREEN}Deployment complete!${NC}"
echo -e "${GREEN}You can access:${NC}"
echo -e "PingFederate Admin Console: https://localhost:9999/pingfederate"
echo -e "PingAccess Admin Console: https://localhost:9000"
echo -e "PingDirectory LDAPS: ldaps://localhost:1636"

# Add hosts entry if not exists
if ! grep -q "dive25.local" /etc/hosts; then
    echo -e "${YELLOW}Adding dive25.local to /etc/hosts...${NC}"
    echo "127.0.0.1 dive25.local" | sudo tee -a /etc/hosts
fi
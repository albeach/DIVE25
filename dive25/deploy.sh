#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ENV=$1
DOMAIN=${ENV:-"dev"}

echo -e "${GREEN}Starting DIVE25 deployment for ${ENV} environment${NC}"

# Setup certificates
echo -e "${YELLOW}Generating certificates...${NC}"
./scripts/setup-certs.sh

# Import certificates to PingFederate
echo -e "${YELLOW}Importing certificates to PingFederate...${NC}"
docker exec pingfederate keytool -importkeystore \
    -srckeystore /opt/in/certificates/dev/server.p12 \
    -srcstoretype PKCS12 \
    -srcstorepass 2FederateM0re \
    -destkeystore /opt/out/instance/server/default/conf/keystore.jks \
    -deststoretype JKS \
    -deststorepass 2FederateM0re \
    -noprompt

# Import certificates to PingAccess
echo -e "${YELLOW}Importing certificates to PingAccess...${NC}"
docker exec pingaccess keytool -importkeystore \
    -srckeystore /opt/in/certificates/dev/server.p12 \
    -srcstoretype PKCS12 \
    -srcstorepass 2FederateM0re \
    -destkeystore /opt/out/instance/conf/keystore \
    -deststorepass 2Access \
    -noprompt

# Deploy server profiles
echo -e "${YELLOW}Deploying server profiles...${NC}"
./server-profiles/deploy-profiles.sh

echo -e "${GREEN}Deployment complete!${NC}"

#!/bin/bash
# dive25/scripts/setup-certs.sh

# Create OpenSSL configuration
cat > openssl.cnf << EOL
[ req ]
default_bits = 2048
prompt = no
default_md = sha256
req_extensions = v3_req
distinguished_name = dn
x509_extensions = v3_ca

[ dn ]
C = US
ST = VA
L = Default
O = DIVE25
CN = dive25.local

[ v3_req ]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[ v3_ca ]
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid:always,issuer
basicConstraints = CA:true
keyUsage = keyCertSign, cRLSign

[ alt_names ]
DNS.1 = dive25.local
DNS.2 = *.dive25.local
DNS.3 = localhost
IP.1 = 127.0.0.1
EOL

# Create directory structure
mkdir -p certificates/{dev,prod}

# Generate certificates for development
generate_dev_certs() {
    cd certificates/dev

    # Generate CA key and certificate
    openssl genrsa -out ca.key 4096
    openssl req -x509 -new -nodes -key ca.key -sha256 -days 1024 -out ca.crt \
        -config ../../openssl.cnf -extensions v3_ca

    # Generate server key and CSR
    openssl genrsa -out server.key 2048
    openssl req -new -key server.key -out server.csr \
        -config ../../openssl.cnf

    # Sign the certificate
    openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key \
        -CAcreateserial -out server.crt -days 365 \
        -sha256 -extfile ../../openssl.cnf -extensions v3_req

    # Create PKCS12 file for Java keystores
    openssl pkcs12 -export -in server.crt -inkey server.key \
        -out server.p12 -name dive25 \
        -CAfile ca.crt -caname root \
        -password pass:2FederateM0re

    cd ../..
}

# Updated deployment script
cat > deploy.sh << 'EOL'
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
EOL

chmod +x deploy.sh

# Create docker-compose extension for certificate mounting
cat > docker-compose.override.yml << EOL
version: '3.8'

services:
  pingfederate:
    volumes:
      - ./certificates:/opt/in/certificates
      
  pingaccess:
    volumes:
      - ./certificates:/opt/in/certificates
      
  pingdirectory:
    volumes:
      - ./certificates:/opt/in/certificates
EOL

# Execute certificate generation
generate_dev_certs

echo "Certificate setup complete!"

chmod +x scripts/setup-certs.sh
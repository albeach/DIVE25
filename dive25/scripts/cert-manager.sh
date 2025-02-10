#!/bin/bash
# dive25/scripts/cert-manager.sh

generate_certs() {
    local env=$1
    local domain=$2
    
    # Generate root CA
    openssl genrsa -out ca.key 4096
    openssl req -new -x509 -sha256 -days 1095 -key ca.key -out ca.crt \
        -subj "/C=US/ST=VA/L=Default/O=DIVE25/CN=DIVE25 Root CA"

    # Generate server certificate
    openssl genrsa -out server.key 2048
    openssl req -new -key server.key -out server.csr \
        -subj "/C=US/ST=VA/L=Default/O=DIVE25/CN=${domain}"

    # Sign server certificate
    openssl x509 -req -sha256 -days 365 -in server.csr \
        -CA ca.crt -CAkey ca.key -CAcreateserial \
        -out server.crt

    # Move certificates to appropriate locations
    mkdir -p dive25/certificates/${env}
    mv {ca,server}.{key,crt} dive25/certificates/${env}/
    rm server.csr ca.srl
}

# Usage
case "$1" in
    "dev")
        generate_certs "dev" "dive25.local"
        ;;
    "prod")
        generate_certs "prod" "dive25.com"
        ;;
    *)
        echo "Usage: $0 {dev|prod}"
        exit 1
        ;;
esac
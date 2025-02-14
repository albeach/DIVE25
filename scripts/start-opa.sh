#!/bin/bash

# Determine architecture and choose the appropriate OPA image tag
if [[ "$(uname)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
    PLATFORM_FLAG="--platform linux/arm64"
    echo "Detected Darwin ARM64. Using ARM64 static variant."
    IMAGE_NAME="openpolicyagent/opa:latest-static"
else
    PLATFORM_FLAG=""
    IMAGE_NAME="openpolicyagent/opa:latest"
fi

# Remove any existing container named 'opa'
if docker ps -a --format '{{.Names}}' | grep -q '^opa$'; then
    echo "Removing existing 'opa' container..."
    docker rm -f opa
fi

# Pull the appropriate OPA image
echo "Pulling the latest $IMAGE_NAME image..."
docker pull $PLATFORM_FLAG $IMAGE_NAME

# Check if the image exists
if docker image inspect $IMAGE_NAME > /dev/null 2>&1; then
    echo "$IMAGE_NAME successfully pulled. Launching container..."
    docker run $PLATFORM_FLAG --name opa -d -p 8181:8181 $IMAGE_NAME run --server --addr :8181
else
    echo "Error: $IMAGE_NAME not found even after pull."
    exit 1
fi 
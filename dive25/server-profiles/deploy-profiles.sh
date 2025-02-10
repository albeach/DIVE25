#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Starting DIVE25 server profiles deployment...${NC}"

# Function to check container logs
check_container_logs() {
    local container=$1
    echo -e "${YELLOW}Checking ${container} logs:${NC}"
    docker logs $container
}

# Function to verify container is running
verify_container() {
    local container=$1
    if ! docker ps | grep -q $container; then
        echo -e "${RED}${container} is not running. Checking logs:${NC}"
        check_container_logs $container
        return 1
    fi
    return 0
}

# Deploy PingFederate profile
echo -e "${YELLOW}Deploying PingFederate server profile...${NC}"
if verify_container "pingfederate"; then
    docker exec pingfederate sh -c "cp -r /opt/in/instance/server/default/conf/* /opt/out/instance/server/default/conf/"
fi

# Deploy PingAccess profile
echo -e "${YELLOW}Deploying PingAccess server profile...${NC}"
if verify_container "pingaccess"; then
    docker exec pingaccess sh -c "cp -r /opt/in/instance/conf/* /opt/out/instance/conf/"
fi

# Deploy PingDirectory profile
echo -e "${YELLOW}Deploying PingDirectory server profile...${NC}"
if verify_container "pingdirectory"; then
    docker exec pingdirectory sh -c "cp -r /opt/in/instance/* /opt/out/instance/"
fi

# Restart services
echo -e "${YELLOW}Restarting services...${NC}"
for container in pingfederate pingaccess pingdirectory; do
    if verify_container $container; then
        docker restart $container
        sleep 5
        if ! verify_container $container; then
            echo -e "${RED}${container} failed to restart. Checking logs:${NC}"
            check_container_logs $container
        fi
    fi
done

echo -e "${GREEN}Server profiles deployment complete!${NC}"
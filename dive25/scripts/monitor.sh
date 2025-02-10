#!/bin/bash
# dive25/scripts/monitor.sh

check_services() {
    services=("pingfederate:9031" "pingaccess:3000" "pingdirectory:1636")
    
    for service in "${services[@]}"; do
        IFS=':' read -r name port <<< "$service"
        if curl -sf https://${DOMAIN}:${port}/heartbeat.ping > /dev/null; then
            echo -e "${GREEN}${name} is healthy${NC}"
        else
            echo -e "${RED}${name} is not responding${NC}"
        fi
    done
}

while true; do
    check_services
    sleep 60
done
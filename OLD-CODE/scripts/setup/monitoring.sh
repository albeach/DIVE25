# DIVE25/scripts/setup/monitoring.sh

# This script manages the monitoring infrastructure for DIVE25. It sets up 
# Prometheus and Grafana with appropriate configurations for both development
# and production environments, including specialized alerts for production.

setup_monitoring() {
    local environment=$1
    
    log "INFO" "Setting up monitoring infrastructure for ${environment}"
    
    # Create monitoring namespace if it doesn't exist
    kubectl create namespace monitoring 2>/dev/null || true
    
    # Set up monitoring stack based on environment
    if [[ "$environment" == "prod" ]]; then
        setup_production_monitoring
    else
        setup_development_monitoring
    fi
    
    # Wait for monitoring services to be ready
    wait_for_monitoring_services
}

setup_production_monitoring() {
    log "INFO" "Configuring production monitoring stack"
    
    # Deploy Prometheus with production configuration
    kubectl apply -f "${SCRIPT_DIR}/docker/monitoring/prometheus/prometheus-prod.yml" -n monitoring
    
    # Deploy Alertmanager with production alerts
    kubectl apply -f "${SCRIPT_DIR}/docker/monitoring/alertmanager/alertmanager-prod.yml" -n monitoring
    
    # Deploy Grafana with production dashboards
    kubectl apply -f "${SCRIPT_DIR}/docker/monitoring/grafana/grafana-prod.yml" -n monitoring
    
    # Configure federation monitoring rules
    configure_federation_monitoring
}

setup_development_monitoring() {
    log "INFO" "Configuring development monitoring stack"
    
    # Deploy basic monitoring stack without alerting
    docker-compose -f "${SCRIPT_DIR}/docker/monitoring/docker-compose.yml" up -d
}

configure_federation_monitoring() {
    # Configure specialized federation metrics and alerts
    
    # Authentication success rate monitoring
    cat > "${SCRIPT_DIR}/docker/monitoring/prometheus/rules/federation.yml" << EOL
groups:
  - name: federation_monitoring
    rules:
      - record: federation_auth_success_rate
        expr: |
          rate(federation_auth_success_total[5m]) /
          rate(federation_auth_attempts_total[5m])
      
      - alert: HighAuthFailureRate
        expr: federation_auth_success_rate < 0.95
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: High authentication failure rate
          description: Authentication success rate is below 95%

      - alert: FederationPartnerDown
        expr: federation_partner_health == 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: Federation partner is down
          description: Federation connection to {{ \$labels.partner }} is down
EOL

    # Apply the new rules
    kubectl apply -f "${SCRIPT_DIR}/docker/monitoring/prometheus/rules/federation.yml" -n monitoring
}

wait_for_monitoring_services() {
    log "INFO" "Waiting for monitoring services to be ready..."
    
    local services=("prometheus" "grafana")
    if [[ "$environment" == "prod" ]]; then
        services+=("alertmanager")
    fi
    
    for service in "${services[@]}"; do
        kubectl rollout status deployment/$service -n monitoring --timeout=300s || {
            log "ERROR" "Failed to start $service"
            exit 1
        }
    done
    
    log "INFO" "Monitoring services are ready"
}

# This function sets up monitoring dashboards for federation services
setup_federation_dashboards() {
    log "INFO" "Setting up federation monitoring dashboards"
    
    # Deploy the federation overview dashboard
    kubectl create configmap federation-dashboard \
        --from-file="${SCRIPT_DIR}/docker/monitoring/grafana/dashboards/federation-overview.json" \
        -n monitoring --dry-run=client -o yaml | kubectl apply -f -
    
    # Configure Grafana datasources
    kubectl create configmap grafana-datasources \
        --from-file="${SCRIPT_DIR}/docker/monitoring/grafana/datasources/prometheus.yml" \
        -n monitoring --dry-run=client -o yaml | kubectl apply -f -
}

# This function verifies monitoring system health
verify_monitoring_health() {
    log "INFO" "Verifying monitoring system health"
    
    # Check Prometheus targets
    local prometheus_targets=$(curl -s http://prometheus:9090/api/v1/targets)
    if ! echo "$prometheus_targets" | grep -q '"health":"up"'; then
        log "WARN" "Some Prometheus targets are down"
    fi
    
    # Check Grafana health
    if ! curl -s http://grafana:4000/api/health | grep -q '"database":"ok"'; then
        log "WARN" "Grafana health check failed"
    fi
    
    # For production, verify alertmanager
    if [[ "$environment" == "prod" ]]; then
        if ! curl -s http://alertmanager:9093/-/healthy | grep -q "ok"; then
            log "WARN" "Alertmanager health check failed"
        fi
    fi
}
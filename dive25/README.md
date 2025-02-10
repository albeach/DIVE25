# DIVE25 Deployment Runbook

## Pre-Deployment Checklist

### 1. Environment Verification
- [ ] Environment variables configured
- [ ] Secrets available in vault
- [ ] Network policies configured
- [ ] Database backups completed

### 2. Security Checks
- [ ] Security scan completed
- [ ] Vulnerabilities addressed
- [ ] Certificate validity verified
- [ ] IAM permissions validated

### 3. Partner Readiness
- [ ] Partner IdPs notified
- [ ] Metadata exchange completed
- [ ] Test federation connections verified
- [ ] Rollback points identified

## Deployment Steps

### 1. Infrastructure Update
```bash
# Update Kubernetes configuration
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/network-policies.yaml

# Update Helm dependencies
helm dependency update ./helm

### 2. Database Migration
# Backup existing data
kubectl exec -n dive25 mongodb-0 -- mongodump --archive=/tmp/backup.gz --gzip

# Apply migrations
kubectl apply -f k8s/jobs/db-migration.yaml

### 3. Core Components Deployment

# Deploy PingFederate
helm upgrade --install pingfederate ./helm/pingfederate \
  --namespace dive25 \
  --values ./helm/values-prod.yaml

# Deploy PingAccess
helm upgrade --install pingaccess ./helm/pingaccess \
  --namespace dive25 \
  --values ./helm/values-prod.yaml

# Deploy API
helm upgrade --install dive25-api ./helm/api \
  --namespace dive25 \
  --values ./helm/values-prod.yaml
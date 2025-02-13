
![DIVE25-ProjSnooze-Header-v1 2](https://github.com/user-attachments/assets/9a94e85a-fd86-4758-8ee6-607cdd23ec3b)

# DIVE25 | Project Snooze Control | Deployment Runbook

## Overview
DIVE25 is a secure identity and access management platform integrating Ping Identity solutions with containerized deployments. This repository contains the deployment runbooks, configurations, and automation scripts for managing and maintaining the DIVE25 platform across different environments.

In a multi-partner NATO environment, enabling secure, controlled access to a centralized repository of sensitive documents requires robust identity federation and Attribute-Based Access Control (ABAC). By adhering to NATO STANAGs (4774, 4778, and 5636) and NATO Security Policy, this report outlines a comprehensive approach for:

- **Federated Authentication**: Integrating multiple Identity Providers (IdPs) through PingFederate.
- **Standardized Attributes**: Ensuring attributes like classification level, caveats, nationality, and organizational affiliation are consistent and interoperable.
- **OPA-based ABAC**: Using Open Policy Agent (OPA) and Rego policies to enforce fine-grained authorization decisions.
- **Document Metadata Storage**: Using MongoDB for flexible and scalable metadata management.
- **User-Friendly Front-End**: WordPress as a landing page, coupled with a Backend API to orchestrate access decisions.

The outcome is a system where users authenticate via their own IdP, attributes are normalized, and access decisions are made dynamically based on classification, caveats, organizational affiliation, and other STANAG-driven rules before documents are accessible.

## Table of Contents
1. [System Requirements](#system-requirements)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Deployment](#deployment)
5. [API Endpoints](#api-endpoints)
6. [Testing](#testing)
6. [Monitoring and Logging](#monitoring-and-logging)
7. [Security](#security)
8. [Backup and Recovery](#backup-and-recovery)
9. [Troubleshooting](#troubleshooting)
10. [License](#license)

---

## System Requirements
### Prerequisites
- Docker 24.0 or higher
- Kubernetes 1.25 or higher
- Helm 3.x
- Node.js 18.x or higher
- Ping Identity license files
- SSL certificates (self-signed for development, Let's Encrypt for production)
- Access to MongoDB, Redis, and MariaDB databases
- Network connectivity to required services
- Open Policy Agent (OPA) installed
- WordPress for front-end integration

## Installation
### 1. Clone Repository
```bash
git clone https://github.com/organization/dive25.git
cd DIVE25
```

### 2. Set Up Environment Variables
```bash
cp .env.example .env
```
Edit `.env` and update the required values:
```
PING_IDENTITY_DEVOPS_USER=your_username
PING_IDENTITY_DEVOPS_KEY=your_key
WP_DB_PASSWORD=your_database_password
MONGO_URI=mongodb://mongodb:27017/dive25
OPA_URL=http://opa:8181
```

### 3. Install Dependencies
```bash
sudo apt install npm
```

---

## Configuration
### Kubernetes Configuration
Modify the necessary Kubernetes configuration files in `k8s/` before deployment.

### Docker Configuration
Ensure that Docker is set up correctly and required images are available.
```bash
docker compose -f docker-compose.dev.yml pull
docker compose -f docker-compose.dev.yml up -d
```

### Helm Setup
Ensure Helm charts are configured before deploying.
```bash
helm repo add pingidentity https://helm.pingidentity.com/
helm repo update
```

### OPA Rego Policies
Ensure the access policies align with NATO STANAGs 4774, 4778, and 5636.
```bash
cp policies/access_policy.rego /path/to/opa/
```

---

## Deployment
### Development Deployment
```bash
sudo ./deploy.sh --env dev --ping-user your_username --ping-key your_key
```

### Production Deployment
```bash
sudo ./deploy.sh --env prod --ping-user your_username --ping-key your_key
```

### Infrastructure Deployment
```bash
kubectl apply -f k8s/namespace.yaml
helm upgrade --install pingfederate pingidentity/pingfederate --namespace dive25 --values helm/values-pingfederate.yaml
```

---

## API Endpoints
The API provides comprehensive functionality for managing users, partners, documents, and access control. Each request requires authentication, and attributes such as `uid`, `clearance`, `countryOfAffiliation`, and `cOI` must be included for access control.

### User Management
#### Register a New User
```bash
POST /api/users/register
Content-Type: application/json
{
  "uid": "user123",
  "username": "newuser@example.com",
  "password": "securepassword",
  "email": "newuser@example.com",
  "cOI": ["OpAlpha"],
  "clearance": "SECRET",
  "countryOfAffiliation": "USA"
}
```
Response:
```json
{
  "message": "User registered successfully",
  "userId": "98765"
}
```

#### Assign User Role
```bash
POST /api/users/assign-role
Content-Type: application/json
{
  "uid": "user123",
  "role": "analyst"
}
```
Response:
```json
{
  "message": "Role assigned successfully"
}
```

### Partner Registration
#### Register a Partner
```bash
POST /api/partners/register
Content-Type: application/json
{
  "partnerId": "PARTNER001",
  "partnerName": "Example Partner",
  "federationType": "SAML",
  "metadataUrl": "https://partner.example.com/metadata.xml",
  "cOI": ["OpAlpha"],
  "clearance": "SECRET",
  "countryOfAffiliation": "USA"
}
```

### Document Management
#### Upload a Document
```bash
POST /api/documents/upload
Content-Type: multipart/form-data
{
  "file": "classified-report.pdf",
  "metadata": {
    "classification": "SECRET",
    "cOI": ["OpAlpha"],
    "countryOfAffiliation": "USA"
  }
}
```

#### Retrieve Document Metadata
```bash
GET /api/documents/metadata/67890
```
Response:
```json
{
  "documentId": "67890",
  "classification": "SECRET",
  "caveats": ["NOFORN"],
  "allowedNations": ["USA", "GBR", "FRA"],
  "cOI": ["OpAlpha"],
  "optionalAttributes": {
    "validUntil": "2025-12-31",
    "sensitivity": "HIGH"
  }
}
```

### Access Control & Policy Enforcement
#### Validate User Access to a Document
```bash
POST /api/documents/access
Content-Type: application/json
{
  "uid": "user123",
  "documentId": "67890",
  "cOI": ["OpAlpha", "MissionX"],
  "clearance": "SECRET",
  "countryOfAffiliation": "USA"
}
```

#### Policy Evaluation via OPA
```bash
POST /api/authorization/evaluate
Content-Type: application/json
{
  "user": {
    "uid": "user123",
    "clearance": "SECRET",
    "countryOfAffiliation": "USA",
    "cOI": ["OpAlpha"]
  },
  "resource": {
    "id": "67890",
    "classification": "SECRET",
    "allowedNations": ["USA", "GBR"],
    "cOI": ["OpAlpha"]
  }
}
```

---

## Testing
### Unit Tests
Run unit tests for API endpoints and access policies:
```bash
npm run test
```

### Integration Tests
Validate API functionality:
```bash
POST /api/test/integration
Content-Type: application/json
{
  "testScenario": "User with valid cOI and clearance",
  "user": {
    "uid": "user123",
    "clearance": "SECRET",
    "countryOfAffiliation": "USA",
    "cOI": ["OpAlpha"]
  },
  "expectedOutcome": "Access granted"
}
```

### Load Testing
Simulate multiple users accessing documents:
```bash
k6 run load-test.js
```

### Security Testing
Conduct vulnerability scans on APIs:
```bash
npx audit-ci --low
```

---

## Monitoring and Logging
### Health Checks
```bash
kubectl exec -n dive25 pingfederate-0 -- health-check.sh
curl https://dive25.com/health
```

### Log Collection
```bash
kubectl logs -n dive25 -l app=dive25-api --tail=1000
kubectl logs -n dive25 -l app=pingfederate --tail=1000
```

### Prometheus and Grafana
```bash
curl https://dive25.com/metrics
open https://grafana.dive25.com/d/federation-overview
```

---

## Security
### Certificate Management
- Self-signed certificates for development (`certificates/dev/`)
- Let's Encrypt for production (`certificates/prod/`)
- Automated renewal via `certbot`

### Access Control
- Uses Open Policy Agent (OPA) for Attribute-Based Access Control (ABAC)
- Configured via `access_policy.rego`
- Integrates with PingFederate for federated authentication

### Security Scanning
- Automated OAuth security checks (`scripts/security/oauth-security-scanner.ts`)
- SAML configuration analyzer (`scripts/security/saml-config-analyzer.ts`)

---

## Backup and Recovery
### Database Backups
```bash
kubectl exec -n dive25 mongodb-0 -- mongodump --archive=/tmp/backup.gz --gzip
```

### Restore from Backup
```bash
kubectl exec -n dive25 mongodb-0 -- mongorestore --archive=/tmp/backup.gz --gzip
```

### Rollback Procedures
```bash
helm rollback pingfederate
helm rollback pingaccess
kubectl rollout restart deployment/api -n dive25
```

---

## Troubleshooting
### Common Issues
- **Docker container fails to start:** Ensure environment variables are set correctly.
- **Helm deployment fails:** Run `helm dependency update ./helm` and try again.
- **Certificate issues:** Ensure SSL certificates are valid and properly mounted.
- **Service not reachable:** Check firewall rules and network policies.

---

## License
DIVE25 is licensed under [MIT License](LICENSE).


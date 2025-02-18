# DIVE25 - Federated Identity Management and Access Control System

## Quick Start

![DIVE25-ProjSnooze-Header-v1 2](https://github.com/user-attachments/assets/9a94e85a-fd86-4758-8ee6-607cdd23ec3b)

# DIVE25 | Project Snooze Control | Deployment Runbook

## Overview
DIVE25 is a secure identity and access management platform integrating open-source frameworks with containerized deployments. This repository contains the deployment runbooks, configurations, and automation scripts for managing and maintaining the DIVE25 platform across different environments.

In a multi-partner NATO environment, enabling secure, controlled access to a centralized repository of sensitive documents requires robust identity federation and Attribute-Based Access Control (ABAC). By adhering to NATO STANAGs (4774, 4778, and 5636) and NATO Security Policy, this report outlines a comprehensive approach for:

- **Federated Authentication**: Integrating multiple Identity Providers (IdPs) through Kong.
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
- Node.js 18.x or higher
- SSL certificates (self-signed for development, Let's Encrypt for production)
- Access to MongoDB, Redis, and PostgreSQL databases
- Network connectivity to required services
- Open Policy Agent (OPA) installed

## Installation
### 1. Clone Repository
```bash
git clone https://github.com/albeach/dive25.git
cd DIVE25
```

### 2. Set Up Environment Variables
```bash
cp .env.example .env
```
Edit `.env` and update the required values:
```
WP_DB_PASSWORD=your_database_password
MONGO_URI=mongodb://mongodb:27017/dive25
OPA_URL=http://opa:8181
```

### 3. Install Dependencies
```bash
sudo apt install npm
```

---

## Configuration (Optional)
### Kubernetes Configuration
Modify the necessary Kubernetes configuration files in `k8s/` before deployment.

### Docker Configuration
Ensure that Docker is set up correctly and required images are available.
```bash
docker compose -f docker-compose.yml pull
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
sudo ./deploy.sh --env dev
```

### Production Deployment
```bash
sudo ./deploy.sh --env prod
```

### Infrastructure Deployment
```bash
kubectl apply -f k8s/namespace.yaml
helm upgrade --install pingfederate pingidentity/pingfederate --namespace dive25 --values helm/values-pingfederate.yaml
```

### Deployment Options

#### 1. Development Environment
- Custom configuration for local development
- Hot reloading enabled
- Verbose logging
- API documentation available

Requirements:
- Docker & Docker Compose
- Node.js 18+
- 4GB RAM recommended

#### 2. Staging Environment
- Pre-configured test environment
- Sample data and users included
- Monitoring enabled
- Perfect for testing and demos

Requirements:
- Docker & Docker Compose
- 8GB RAM recommended
- 10GB free disk space

#### 3. Production Environment
- Full security features
- SSL/TLS enabled
- Automated backups
- Monitoring and alerts

Requirements:
- Docker & Docker Compose
- 16GB RAM recommended
- 20GB free disk space
- Domain name with DNS configured
- Valid email for SSL certificates

```bash
# Select option 3 when running start.sh
# You'll need to provide:
- Domain name
- SSL certificate email
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

### Credentials
- Credentials are generated during installation
- Saved to `credentials_[env].txt`
- **IMPORTANT**: Save these securely and delete the file

### Default Ports
- API: 3000
- MongoDB: 27017
- Redis: 6379
- Monitoring: 9090

### SSL Certificates
- Development: Self-signed
- Staging: Self-signed
- Production: Let's Encrypt

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

### Health Checks
```bash
# Check service health
curl http://localhost:3000/api/health

# View logs
docker-compose logs -f
```

### Backups
```bash
# Manual backup
docker-compose exec mongodb mongodump

# View backup status
docker-compose exec mongodb ls /backup
```

### Updates
```bash
# Pull latest changes
git pull

# Restart services
docker-compose down
./start.sh  # Select same environment
```

---

## Troubleshooting
### Common Issues
- **Docker container fails to start:** Ensure environment variables are set correctly.
- **Helm deployment fails:** Run `helm dependency update ./helm` and try again.
- **Certificate issues:** Ensure SSL certificates are valid and properly mounted.
- **Service not reachable:** Check firewall rules and network policies.

1. **Services won't start**
```bash
# Check logs
docker-compose logs -f

# Verify disk space
df -h

# Check memory
free -m
```

2. **Database Connection Issues**
```bash
# Check MongoDB status
docker-compose exec mongodb mongo --eval "db.serverStatus()"

# Reset database
docker-compose down -v
./start.sh  # Select same environment
```

3. **SSL Certificate Issues**
```bash
# Manual SSL renewal
docker-compose exec nginx certbot renew

# Check certificate status
docker-compose exec nginx certbot certificates
```

---

## License
DIVE25 is licensed under [MIT License](LICENSE).

# DIVE25 FedHub

## Quick Start (Ubuntu Server)

### Staging (.env.staging)


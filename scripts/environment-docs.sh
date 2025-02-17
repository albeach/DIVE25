#!/bin/bash

show_environment_docs() {
    local env=$1
    
    echo "=== $env Environment Setup Guide ==="
    echo
    
    case $env in
        dev)
            cat << EOL
Development Environment
----------------------
Suitable for local development with:
- Hot reloading enabled
- Debug logging
- Local database exposed on port 5432
- No Redis caching (optional)
- No SSL requirement

Required Configuration:
- Basic database credentials
- JWT secret for authentication

To start: ./setup.sh dev
EOL
            ;;
            
        staging)
            cat << EOL
Staging Environment
------------------
Mirrors production with:
- Redis caching enabled
- Basic monitoring
- Optional SSL
- Rate limiting enabled
- Swagger documentation exposed

Required Configuration:
- Database credentials
- Redis password
- Monitoring tokens
- API keys for external services

To start: ./setup.sh staging
EOL
            ;;
            
        prod)
            cat << EOL
Production Environment
--------------------
Full production setup with:
- High availability configuration
- Redis caching required
- Full monitoring suite
- Automated backups
- SSL required
- Rate limiting enforced
- Documentation hidden

Required Configuration:
- Secure database credentials
- Redis password
- Monitoring tokens
- API keys
- SSL certificates
- AWS credentials for backups

To start: ./setup.sh prod
EOL
            ;;
    esac
    
    echo
    echo "For more details, see docs/environments/$env.md"
} 
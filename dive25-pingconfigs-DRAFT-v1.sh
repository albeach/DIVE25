#!/bin/bash
set -e

echo "Creating directory structure..."

mkdir -p layered-profiles/common/pingfederate
mkdir -p layered-profiles/common/pingdirectory
mkdir -p layered-profiles/common/pingaccess
mkdir -p layered-profiles/common/config-files

mkdir -p layered-profiles/development/pingfederate
mkdir -p layered-profiles/development/pingdirectory
mkdir -p layered-profiles/development/pingaccess

mkdir -p layered-profiles/production/pingfederate
mkdir -p layered-profiles/production/pingdirectory
mkdir -p layered-profiles/production/pingaccess

echo "Creating common configuration files..."

# Common PingFederate configuration
cat <<'EOF' > layered-profiles/common/pingfederate/config.yaml
# PingFederate common configuration (version 12.2.0-latest)
server:
  instanceName: "DIVE25-PF"
  version: "12.2.0-latest"
  bindAddress: "0.0.0.0"
  runtimePort: 9031
  adminPort: 9999
  dataDirectory: "/opt/pingidentity/data"
  logsDirectory: "/opt/pingidentity/logs"

idp:
  enabled: true
  metadataUrl: "https://pingfederate.dive25.com:9031/idp/metadata"
  localIdP:
    entityId: "urn:dive25:localidp"
    signingCertificate: "/opt/pingidentity/certs/signing.crt"
    privateKey: "/opt/pingidentity/certs/signing.key"

federation:
  trustedIdPs:
    - name: "Generic_IdP"
      type: "SAML"
      metadataUrl: "https://idp.example.com/metadata"

attributes:
  normalizationSchema: "DIVE25"
  mappingRulesFile: "/opt/pingidentity/config/attribute-mapping.json"

sessionManagement:
  sessionTimeout: 3600
  idleTimeout: 600

security:
  tls:
    enabled: true
    keystorePath: "/opt/pingidentity/keystore/dive25.jks"
    keystorePassword: "changeit"

administrators:
  - username: "mike"
    password: "mike123"
  - username: "aubrey"
    password: "aubrey456"
EOF

# Common PingDirectory configuration
cat <<'EOF' > layered-profiles/common/pingdirectory/config.yaml
# PingDirectory common configuration (version 10.2.0-latest)
server:
  instanceName: "DIVE25-PD"
  version: "10.2.0-latest"
  bindAddress: "0.0.0.0"
  port: 389
  dataDirectory: "/opt/pingidentity/data"
  logsDirectory: "/opt/pingidentity/logs"
  replication:
    enabled: false

directory:
  baseDN: "dc=dive25,dc=com"
  schemaFile: "/opt/pingidentity/config/schema.ldif"
  attributeMappings:
    uniqueIdentifier: "uid"
    clearance: "clearance"
    countryOfAffiliation: "country"
    coiTags: "coiTags"
    lacvCode: "lacvCode"
  indices:
    - attribute: "uid"
      type: "equality"
    - attribute: "clearance"
      type: "equality"

initialData:
  file: "/opt/pingidentity/config/initial-users.ldif"

administrators:
  - username: "mike"
    password: "mike123"
  - username: "aubrey"
    password: "aubrey456"
EOF

# Common PingAccess configuration
cat <<'EOF' > layered-profiles/common/pingaccess/config.yaml
# PingAccess common configuration (version 8.2.0-latest)
server:
  instanceName: "DIVE25-PA"
  version: "8.2.0-latest"
  bindAddress: "0.0.0.0"
  port: 8443
  dataDirectory: "/opt/pingidentity/data"
  logsDirectory: "/opt/pingidentity/logs"

reverseProxy:
  enabled: true
  proxyHeaders:
    - "X-Forwarded-For"
    - "X-Forwarded-Proto"
    - "X-Forwarded-Host"

accessControl:
  defaultPolicy: "deny"
  routes:
    - name: "WordPress_Frontend"
      path: "/wordpress/*"
      target: "http://wordpress:80"
      ssoRequired: true
      description: "Routes traffic to the WordPress front-end UI"
    - name: "Backend_API"
      path: "/api/*"
      target: "http://nodejs-api:3000"
      ssoRequired: true
      opaIntegration:
        enabled: true
        opaUrl: "http://opa:8181/v1/data/access_policy/allow"
      description: "Routes traffic to the Node.js API with OPA-based ABAC enforcement"

administrators:
  - username: "mike"
    password: "mike123"
  - username: "aubrey"
    password: "aubrey456"
EOF

# Common attribute mapping file
cat <<'EOF' > layered-profiles/common/config-files/attribute-mapping.json
{
  "mappings": [
    {
      "external": "eduPersonPrincipalName",
      "internal": "uniqueIdentifier"
    },
    {
      "external": "securityClearance",
      "internal": "clearance"
    },
    {
      "external": "country",
      "internal": "countryOfAffiliation"
    },
    {
      "external": "communitiesOfInterest",
      "internal": "coiTags"
    },
    {
      "external": "lacv",
      "internal": "lacvCode"
    }
  ]
}
EOF

# Common controlled enumerations file
cat <<'EOF' > layered-profiles/common/config-files/controlled-enumerations.json
{
  "clearance": {
    "UNCLASSIFIED": 0,
    "RESTRICTED": 1,
    "NATO CONFIDENTIAL": 2,
    "NATO SECRET": 3,
    "COSMIC TOP SECRET": 4
  },
  "nato_nations": [
    "ALB", "BGR", "HRV", "CZE", "DNK", "EST", "FIN", "GRC", "HUN",
    "ISL", "LVA", "LTU", "LUX", "MNE", "MKD", "NOR", "POL", "PRT",
    "ROU", "SVK", "SVN", "SWE", "USA", "GBR", "FRA", "DEU", "CAN",
    "ITA", "NLD", "BEL", "ESP", "TUR"
  ],
  "fvey_nations": [
    "AUS", "CAN", "NZL", "GBR", "USA"
  ],
  "eu_nations": [
    "FRA", "DEU", "ITA", "ESP", "BEL", "NLD"
  ],
  "valid_coi_tags": [
    "OpAlpha", "OpBravo", "OpGamma", "MissionX", "MissionZ"
  ],
  "valid_lacv_codes": [
    "LACV001", "LACV002", "LACV003", "LACV004"
  ]
}
EOF

# Common initial users LDIF
cat <<'EOF' > layered-profiles/common/config-files/initial-users.ldif
# Pre-populated user entries for the local IdP in PingDirectory

dn: uid=texas,ou=users,dc=dive25,dc=com
objectClass: inetOrgPerson
uid: texas
cn: Texas
sn: User
clearance: UNCLASSIFIED
countryOfAffiliation: USA
coiTags: NATO

dn: uid=quebec,ou=users,dc=dive25,dc=com
objectClass: inetOrgPerson
uid: quebec
cn: Quebec
sn: User
clearance: NATO SECRET
countryOfAffiliation: CAN
coiTags: OpAlpha

dn: uid=ontario,ou=users,dc=dive25,dc=com
objectClass: inetOrgPerson
uid: ontario
cn: Ontario
sn: User
clearance: UNCLASSIFIED
countryOfAffiliation: CAN
coiTags: FVEY

dn: uid=zeeland,ou=users,dc=dive25,dc=com
objectClass: inetOrgPerson
uid: zeeland
cn: Zeeland
sn: User
clearance: UNCLASSIFIED
countryOfAffiliation: NZL
coiTags: FVEY

dn: uid=iowa,ou=users,dc=dive25,dc=com
objectClass: inetOrgPerson
uid: iowa
cn: Iowa
sn: User
clearance: NATO SECRET
countryOfAffiliation: USA

dn: uid=holland,ou=users,dc=dive25,dc=com
objectClass: inetOrgPerson
uid: holland
cn: Holland
sn: User
clearance: NATO SECRET
countryOfAffiliation: NLD
coiTags: NATO
EOF

echo "Creating development configuration files..."

# Development PingFederate configuration
cat <<'EOF' > layered-profiles/development/pingfederate/config.yaml
# Development-specific overrides for PingFederate
server:
  host: "dev.pingfederate.dive25.com"
  port: 9031

idp:
  localIdP:
    entityId: "urn:dive25:localidp:dev"

federation:
  trustedIdPs:
    - name: "Test_IdP"
      type: "SAML"
      metadataUrl: "https://test-idp.dive25.com/metadata"

security:
  tls:
    keystorePath: "/opt/pingidentity/keystore/dev-dive25.jks"
    keystorePassword: "dev_changeit"
EOF

# Development PingDirectory configuration
cat <<'EOF' > layered-profiles/development/pingdirectory/config.yaml
# Development-specific overrides for PingDirectory
server:
  host: "dev.directory.dive25.com"
  port: 1389

directory:
  adminDN: "cn=Directory Manager"
  adminPassword: "dev_password"
EOF

# Development PingAccess configuration
cat <<'EOF' > layered-profiles/development/pingaccess/config.yaml
# Development-specific PingAccess configuration (v8.2.0-latest)
server:
  host: "dev.proxy.dive25.com"
  port: 8443
  bindAddress: "0.0.0.0"
  dataDirectory: "/opt/pingidentity/data"
  logsDirectory: "/opt/pingidentity/logs"

sslContext:
  enabled: true
  keyStore:
    path: "/opt/pingidentity/keystore/dev-dive25.jks"
    password: "dev_changeit"
    alias: "dev_pingaccess_cert"
  trustStore:
    path: "/opt/pingidentity/keystore/dev-truststore.jks"
    password: "dev_truststore_password"
  protocols:
    - TLSv1.2
    - TLSv1.3
  cipherSuites:
    - TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
    - TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256

certificates:
  - alias: "dev_pingaccess_cert"
    subject: "CN=dev.proxy.dive25.com, O=DIVE25, C=US"
    issuer: "CN=DIVE25_DEV_CA, O=DIVE25, C=US"
    validFrom: "2023-01-01T00:00:00Z"
    validTo: "2025-12-31T23:59:59Z"

preloadedCertificates:
  - alias: "dev_partner_cert_1"
    subject: "CN=DevPartner1, O=Partner, C=US"
    issuer: "CN=Partner_DEV_CA, O=Partner, C=US"
    validFrom: "2023-01-01T00:00:00Z"
    validTo: "2025-12-31T23:59:59Z"
    filePath: "/opt/pingidentity/keystore/dev_partner_cert_1.crt"
  - alias: "dev_partner_cert_2"
    subject: "CN=DevPartner2, O=Partner, C=US"
    issuer: "CN=Partner_DEV_CA, O=Partner, C=US"
    validFrom: "2023-01-01T00:00:00Z"
    validTo: "2025-12-31T23:59:59Z"
    filePath: "/opt/pingidentity/keystore/dev_partner_cert_2.crt"

trustedCertGroups:
  - groupName: "Partners"
    certificates:
      - alias: "dev_partner_cert_1"
      - alias: "dev_partner_cert_2"
  - groupName: "Internal"
    certificates:
      - alias: "dev_pingaccess_cert"

keyPairs:
  - alias: "dev_signing_key"
    privateKeyPath: "/opt/pingidentity/keys/dev_signing.key"
    publicKeyPath: "/opt/pingidentity/keys/dev_signing.pub"

reverseProxy:
  enabled: true
  proxyHeaders:
    - "X-Forwarded-For"
    - "X-Forwarded-Proto"
    - "X-Forwarded-Host"

accessControl:
  defaultPolicy: "deny"
  routes:
    - name: "WordPress_Frontend"
      path: "/wordpress/*"
      target: "http://dev-wordpress:80"
      ssoRequired: true
      description: "Development route for the WordPress front-end"
    - name: "Backend_API"
      path: "/api/*"
      target: "http://dev-nodejs-api:3000"
      ssoRequired: true
      opaIntegration:
        enabled: true
        opaUrl: "http://opa-dev:8181/v1/data/access_policy/allow"
      description: "Development route for the Node.js API with OPA integration"

administrators:
  - username: "mike"
    password: "mike123"
  - username: "aubrey"
    password: "aubrey456"
EOF

echo "Creating production configuration files..."

# Production PingFederate configuration
cat <<'EOF' > layered-profiles/production/pingfederate/config.yaml
# Production-specific overrides for PingFederate (v12.2.0-latest)
server:
  host: "pingfederate.dive25.com"
  port: 9031

idp:
  localIdP:
    entityId: "urn:dive25:localidp:prod"

federation:
  trustedIdPs:
    - name: "USD_DIVE25"
      type: "SAML"
      metadataUrl: "https://usd.dive25.com/metadata"
      host: "98.166.151.97"
    - name: "USB_DIVE25"
      type: "SAML"
      metadataUrl: "https://usb.dive25.com/metadata"
      host: "70.160.48.40"
    - name: "USH_DIVE"
      type: "SAML"
      metadataUrl: "https://ush.dive.com/metadata"
      host: "10.0.0.5"
    - name: "GeoAxis_OIDC"
      type: "OIDC"
      metadataUrl: "https://oidc-tst.geoaxis.gs.mil/.well-known/openid-configuration"

security:
  tls:
    keystorePath: "/opt/pingidentity/keystore/prod-dive25.jks"
    keystorePassword: "prod_strong_password"
EOF

# Production PingDirectory configuration
cat <<'EOF' > layered-profiles/production/pingdirectory/config.yaml
# Production-specific overrides for PingDirectory (v10.2.0-latest)
server:
  host: "directory.dive25.com"
  port: 389

directory:
  adminDN: "cn=Directory Manager"
  adminPassword: "prod_secure_password"
EOF

# Production PingAccess configuration
cat <<'EOF' > layered-profiles/production/pingaccess/config.yaml
# Production-specific PingAccess configuration (v8.2.0-latest)
server:
  host: "proxy.dive25.com"
  port: 8443
  bindAddress: "0.0.0.0"
  dataDirectory: "/opt/pingidentity/data"
  logsDirectory: "/opt/pingidentity/logs"

sslContext:
  enabled: true
  keyStore:
    path: "/opt/pingidentity/keystore/prod-dive25.jks"
    password: "prod_strong_password"
    alias: "pingaccess_cert"
  trustStore:
    path: "/opt/pingidentity/keystore/truststore.jks"
    password: "truststore_password"
  protocols:
    - TLSv1.2
    - TLSv1.3
  cipherSuites:
    - TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
    - TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256

certificates:
  - alias: "pingaccess_cert"
    subject: "CN=proxy.dive25.com, O=DIVE25, C=US"
    issuer: "CN=DIVE25_CA, O=DIVE25, C=US"
    validFrom: "2023-01-01T00:00:00Z"
    validTo: "2025-12-31T23:59:59Z"
  - alias: "usd_dive25_cert"
    subject: "CN=usd.dive25.com, O=DIVE25, C=US"
    issuer: "CN=DIVE25_CA, O=DIVE25, C=US"
    validFrom: "2023-01-01T00:00:00Z"
    validTo: "2025-12-31T23:59:59Z"
  - alias: "usb_dive25_cert"
    subject: "CN=usb.dive25.com, O=DIVE25, C=US"
    issuer: "CN=DIVE25_CA, O=DIVE25, C=US"
    validFrom: "2023-01-01T00:00:00Z"
    validTo: "2025-12-31T23:59:59Z"
  - alias: "ush_dive_cert"
    subject: "CN=ush.dive.com, O=DIVE25, C=US"
    issuer: "CN=DIVE25_CA, O=DIVE25, C=US"
    validFrom: "2023-01-01T00:00:00Z"
    validTo: "2025-12-31T23:59:59Z"
  - alias: "geoaxis_oidc_cert"
    subject: "CN=oidc-tst.geoaxis.gs.mil, O=GeoAxis, C=US"
    issuer: "CN=GeoAxis_CA, O=GeoAxis, C=US"
    validFrom: "2023-01-01T00:00:00Z"
    validTo: "2025-12-31T23:59:59Z"

preloadedCertificates:
  - alias: "partner_cert_1"
    subject: "CN=Partner1, O=Partner, C=US"
    issuer: "CN=Partner_CA, O=Partner, C=US"
    validFrom: "2023-01-01T00:00:00Z"
    validTo: "2025-12-31T23:59:59Z"
    filePath: "/opt/pingidentity/keystore/partner_cert_1.crt"
  - alias: "partner_cert_2"
    subject: "CN=Partner2, O=Partner, C=US"
    issuer: "CN=Partner_CA, O=Partner, C=US"
    validFrom: "2023-01-01T00:00:00Z"
    validTo: "2025-12-31T23:59:59Z"
    filePath: "/opt/pingidentity/keystore/partner_cert_2.crt"

trustedCertGroups:
  - groupName: "Partners"
    certificates:
      - alias: "usd_dive25_cert"
      - alias: "usb_dive25_cert"
      - alias: "ush_dive_cert"
      - alias: "geoaxis_oidc_cert"
      - alias: "partner_cert_1"
      - alias: "partner_cert_2"
  - groupName: "Internal"
    certificates:
      - alias: "pingaccess_cert"

keyPairs:
  - alias: "signing_key"
    privateKeyPath: "/opt/pingidentity/keys/signing.key"
    publicKeyPath: "/opt/pingidentity/keys/signing.pub"

reverseProxy:
  enabled: true
  proxyHeaders:
    - "X-Forwarded-For"
    - "X-Forwarded-Proto"
    - "X-Forwarded-Host"

accessControl:
  defaultPolicy: "deny"
  routes:
    - name: "WordPress_Frontend"
      path: "/wordpress/*"
      target: "http://wordpress.dive25.com:80"
      ssoRequired: true
      description: "Production route for the WordPress front-end UI"
    - name: "Backend_API"
      path: "/api/*"
      target: "http://nodejs-api.dive25.com:3000"
      ssoRequired: true
      opaIntegration:
        enabled: true
        opaUrl: "http://opa.dive25.com:8181/v1/data/access_policy/allow"
      description: "Production route for the Node.js API with OPA ABAC enforcement"

administrators:
  - username: "mike"
    password: "mike123"
  - username: "aubrey"
    password: "aubrey456"
EOF

echo "Directory structure and configuration files created successfully."

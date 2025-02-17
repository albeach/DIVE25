import dotenv from 'dotenv';
import { oauthConfig } from './pingfederate/oauth/clientConfig';
import { ldapAdapterConfig } from './pingfederate/adapters/ldapConfig';
import { authPolicyConfig } from './pingfederate/authPolicies/policyConfig';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  port: parseInt(process.env.PORT || '3001', 10),
  mongo: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
    replicaSet: process.env.MONGODB_REPLICA_SET === 'true'
  },
  opa: {
    url: process.env.OPA_URL || 'http://localhost:8181/v1/data/dive25/abac',
  },
  pingDirectory: {
    url: process.env.PING_DIRECTORY_URL || 'ldap://localhost:1389',
    bindDN: process.env.PING_DIRECTORY_BIND_DN || 'cn=directory manager',
    bindPassword: process.env.PING_DIRECTORY_BIND_PASSWORD || 'password',
    searchBase: process.env.PING_DIRECTORY_SEARCH_BASE || 'dc=dive25,dc=com',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD
  },
  pingFederate: {
    baseUrl: process.env.PING_FEDERATE_BASE_URL || 'https://pingfederate:9031',
    apiUrl: process.env.PING_FEDERATE_API_URL || 'https://pingfederate:9999/pf-admin-api/v1',
    clientId: process.env.PING_FEDERATE_CLIENT_ID || 'dive25-api',
    clientSecret: process.env.PING_FEDERATE_CLIENT_SECRET || 'your-secret',
    adminApiToken: process.env.PING_FEDERATE_ADMIN_TOKEN,
    oauth: oauthConfig,
    ldapAdapter: ldapAdapterConfig,
    authPolicy: authPolicyConfig,

    // Runtime settings
    sessionValidation: {
      enabled: true,
      timeoutMinutes: 30
    },

    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],

    // Federation settings
    federation: {
      baseProtocol: 'SAML',
      defaultTargetUrl: process.env.DEFAULT_TARGET_URL || 'https://dive25.local',
      assertionLifetime: 5,
      signatureAlgorithm: 'RSA_SHA256',
      digestAlgorithm: 'SHA256'
    }
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    audience: process.env.JWT_AUDIENCE || 'dive25-api',
    issuer: process.env.JWT_ISSUER || 'pingfederate',
  },
  storage: {
    encryptionKey: process.env.STORAGE_ENCRYPTION_KEY || 'default-encryption-key',
    archiveVersions: process.env.STORAGE_ARCHIVE_VERSIONS === 'true',
    malwareScan: process.env.STORAGE_MALWARE_SCAN === 'true'
  },
  keycloak: {
    url: process.env.KEYCLOAK_URL || 'http://keycloak:8080',
    realm: 'dive25',
    clientId: 'dive25-api',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET
  },
};
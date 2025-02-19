import dotenv from 'dotenv';
import { oauthConfig } from './pingfederate/oauth/clientConfig';
import { ldapAdapterConfig } from './pingfederate/adapters/ldapConfig';
import { authPolicyConfig } from './pingfederate/authPolicies/policyConfig';

dotenv.config();

interface MongoDBConfig {
  uri: string;
  dbName: string;
  options: {
    maxPoolSize: number;
    connectTimeoutMS: number;
    socketTimeoutMS: number;
  };
}

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  maxRetriesPerRequest: number;
}

interface OPAConfig {
  url: string;
  timeout: number;
  policyPath: string;
}

interface StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  defaultBucket: string;
  versionBucket: string;
  encryptionKey: string;
  archiveVersions: boolean;
  malwareScan: boolean;
}

interface SecurityConfig {
  jwtSecret: string;
  tokenExpiration: string;
  bcryptRounds: number;
}

interface LoggingConfig {
  level: string;
  directory: string;
  maxSize: string;
  maxFiles: string;
}

export interface SSLConfig {
  enabled: boolean;
  email: string;
  domain: string;
  staging: boolean;  // Use staging for development
  autoRenew: boolean;
  certificatePath: string;
  privateKeyPath: string;
}

export interface Config {
  env: string;
  port: number;
  mongodb: MongoDBConfig;
  redis: RedisConfig;
  opa: OPAConfig;
  storage: StorageConfig;
  security: SecurityConfig;
  logging: LoggingConfig;
  ssl: SSLConfig;
}

const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
    dbName: process.env.MONGODB_DB_NAME || 'nato_docs',
    options: {
      maxPoolSize: 50,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    maxRetriesPerRequest: 3
  },

  opa: {
    url: process.env.OPA_URL || 'http://localhost:8181',
    timeout: parseInt(process.env.OPA_TIMEOUT || '5000', 10),
    policyPath: process.env.OPA_POLICY_PATH || '/v1/data/nato/document'
  },

  storage: {
    endpoint: process.env.STORAGE_ENDPOINT || 'localhost',
    region: process.env.STORAGE_REGION || 'us-east-1',
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
    defaultBucket: process.env.STORAGE_DEFAULT_BUCKET || 'nato-documents',
    versionBucket: process.env.STORAGE_VERSION_BUCKET || 'nato-versions',
    encryptionKey: process.env.STORAGE_ENCRYPTION_KEY || 'your-encryption-key',
    archiveVersions: process.env.STORAGE_ARCHIVE_VERSIONS === 'true',
    malwareScan: process.env.STORAGE_MALWARE_SCAN === 'true'
  },

  security: {
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
    tokenExpiration: process.env.TOKEN_EXPIRATION || '1h',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10)
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    directory: process.env.LOG_DIR || 'logs',
    maxSize: process.env.LOG_MAX_SIZE || '10m',
    maxFiles: process.env.LOG_MAX_FILES || '7d'
  },

  ssl: {
    enabled: process.env.SSL_ENABLED === 'true',
    email: process.env.SSL_EMAIL || '',
    domain: process.env.SSL_DOMAIN || '',
    staging: process.env.SSL_STAGING === 'true',
    autoRenew: process.env.SSL_AUTO_RENEW === 'true',
    certificatePath: process.env.SSL_CERTIFICATE_PATH || '',
    privateKeyPath: process.env.SSL_PRIVATE_KEY_PATH || ''
  }
};

export { config };
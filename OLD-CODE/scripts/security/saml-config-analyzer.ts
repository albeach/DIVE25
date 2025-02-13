// scripts/security/saml-config-analyzer.ts
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { XMLParser } from 'fast-xml-parser';

interface SecurityCheck {
  id: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  check: (config: any) => boolean;
}

const securityChecks: SecurityCheck[] = [
  {
    id: 'SAML001',
    description: 'Weak signature algorithm detected',
    severity: 'HIGH',
    check: (config) => {
      const allowedAlgorithms = ['RSA-SHA256', 'RSA-SHA512'];
      return allowedAlgorithms.includes(config.signatureAlgorithm);
    }
  },
  {
    id: 'SAML002',
    description: 'Missing signature validation requirement',
    severity: 'CRITICAL',
    check: (config) => config.requireSignedAssertions === true
  },
  {
    id: 'SAML003',
    description: 'Insufficient session timeout',
    severity: 'MEDIUM',
    check: (config) => (config.sessionTimeout || 0) <= 3600
  }
];

async function analyzeSAMLConfig(configPath: string): Promise<void> {
  const files = readdirSync(configPath);
  const violations: any[] = [];

  for (const file of files) {
    if (file.endsWith('.xml')) {
      const content = readFileSync(join(configPath, file), 'utf-8');
      const parser = new XMLParser();
      const config = parser.parse(content);

      for (const check of securityChecks) {
        if (!check.check(config)) {
          violations.push({
            file,
            ...check
          });
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error('SAML Security violations found:', violations);
    process.exit(1);
  }
}
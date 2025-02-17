import { PrismaClient, PartnerStatus } from '@prisma/client';
import { MongoDocument } from '../src/models/document';
import { connectMongo } from '../src/db';

const prisma = new PrismaClient();

async function main() {
    // Clean existing data
    await prisma.federation.deleteMany();
    await prisma.partner.deleteMany();
    await MongoDocument.deleteMany({});

    // Create test partners
    const partners = await Promise.all([
        prisma.partner.create({
            data: {
                name: 'NATO Test Partner',
                country: 'Belgium',
                status: PartnerStatus.ACTIVE,
                clearanceLevel: 'SECRET',
                authorizedCOIs: ['CYBER', 'INTELLIGENCE'],
                federation: {
                    create: {
                        protocol: 'SAML',
                        metadata: {
                            issuer: 'https://test-idp.nato.int',
                            endpoints: {
                                sso: 'https://test-idp.nato.int/saml2/sso',
                                slo: 'https://test-idp.nato.int/saml2/slo'
                            }
                        },
                        status: 'ACTIVE'
                    }
                }
            }
        }),
        prisma.partner.create({
            data: {
                name: 'US DoD Test',
                country: 'United States',
                status: PartnerStatus.ACTIVE,
                clearanceLevel: 'TOP_SECRET',
                authorizedCOIs: ['CYBER', 'INTELLIGENCE', 'OPERATIONS'],
                federation: {
                    create: {
                        protocol: 'OIDC',
                        metadata: {
                            issuer: 'https://test.login.gov',
                            endpoints: {
                                authorization: 'https://test.login.gov/authorize',
                                token: 'https://test.login.gov/token'
                            }
                        },
                        status: 'ACTIVE'
                    }
                }
            }
        })
    ]);

    // Create test documents
    await MongoDocument.insertMany([
        {
            title: 'Cyber Threat Assessment 2024',
            classification: 'SECRET',
            metadata: {
                author: 'NATO Cyber Division',
                version: '1.0',
                dateCreated: new Date()
            },
            coiTags: ['CYBER', 'INTELLIGENCE'],
            partnerId: partners[0].id,
            content: 'Test cyber threat assessment content...',
            hash: 'abc123'
        },
        {
            title: 'Joint Operations Handbook',
            classification: 'CONFIDENTIAL',
            metadata: {
                author: 'Operations Command',
                version: '2.1',
                dateCreated: new Date()
            },
            coiTags: ['OPERATIONS'],
            partnerId: partners[1].id,
            content: 'Test operations handbook content...',
            hash: 'def456'
        }
    ]);

    console.log('Seed data created successfully');
}

main()
    .catch((e) => {
        console.error('Error seeding data:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        process.exit(0);
    }); 
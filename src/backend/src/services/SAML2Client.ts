// src/services/SAML2Client.ts
export class SAML2Client {
    private static instance: SAML2Client;

    private constructor() {}

    public static getInstance(): SAML2Client {
        if (!SAML2Client.instance) {
            SAML2Client.instance = new SAML2Client();
        }
        return SAML2Client.instance;
    }
}
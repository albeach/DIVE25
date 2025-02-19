// src/backend/src/config/pingfederate/oauth/geoaxis-config.ts
export const geoAxisConfig = {
    // Basic OIDC Configuration
    provider: {
        issuer: "https://geoaxis.nga.mil/oidc",
        authorizationEndpoint: "https://geoaxis.nga.mil/oidc/authorize",
        tokenEndpoint: "https://geoaxis.nga.mil/oidc/token",
        userInfoEndpoint: "https://geoaxis.nga.mil/oidc/userinfo",
        jwksUri: "https://geoaxis.nga.mil/oidc/jwks"
    },
    
    // Client Configuration
    client: {
        clientId: "${GEOAXIS_CLIENT_ID}",
        clientSecret: "${GEOAXIS_CLIENT_SECRET}",
        redirectUri: "https://dive25.com/callback",
        responseType: "code",
        scope: "openid profile email clearance affiliation"
    },
    
    // Attribute Mapping
    attributeMapping: {
        subject: "sub",
        clearance: "https://geoaxis.nga.mil/claims/clearance",
        countryOfAffiliation: "https://geoaxis.nga.mil/claims/country",
        organization: "https://geoaxis.nga.mil/claims/org"
    }
};
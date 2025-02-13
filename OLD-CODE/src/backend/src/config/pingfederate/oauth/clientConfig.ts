export const oauthConfig = {
    authorizationEndpoint: '/as/authorization.oauth2',
    tokenEndpoint: '/as/token.oauth2',
    userInfoEndpoint: '/as/userinfo.oauth2',
    endSessionEndpoint: '/as/revoke_token.oauth2',
    
    // Required scopes for our application
    requiredScopes: [
      'openid',
      'profile',
      'clearance',
      'country',
      'coi',
      'lacv'
    ],
  
    // Claims mapping
    claimsMappings: {
      uniqueIdentifier: 'uid',
      countryOfAffiliation: 'country',
      clearance: 'clearance',
      coiTags: 'coi',
      lacvCode: 'lacv',
      organizationalAffiliation: 'org'
    }
  };
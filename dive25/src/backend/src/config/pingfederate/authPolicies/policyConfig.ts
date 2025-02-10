export const authPolicyConfig = {
    authnSelectionTrees: [
      {
        name: 'NATO Authentication',
        rootNode: {
          action: 'AUTHENTICATE',
          configuration: {
            authnSources: [
              {
                type: 'IDP_ADAPTER',
                sourceRef: {
                  id: 'OIDCAdapter'
                }
              }
            ]
          }
        }
      }
    ],
    
    failureHandling: {
      mode: 'RESTART_AUTHENTICATION',
      maxAttempts: 3,
      lockoutPeriod: 300
    },
    
    sessionValidation: {
      enforceSignOnPolicies: true,
      enableSessions: true,
      idleTimeoutMins: 30,
      maxTimeoutMins: 480
    }
  };
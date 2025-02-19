export const ldapAdapterConfig = {
    attributeContractFulfillment: {
      uniqueIdentifier: {
        source: 'LDAP',
        value: 'uid'
      },
      countryOfAffiliation: {
        source: 'LDAP',
        value: 'c'
      },
      clearance: {
        source: 'LDAP',
        value: 'clearanceLevel'
      },
      coiTags: {
        source: 'LDAP',
        value: 'coiMembership'
      },
      lacvCode: {
        source: 'LDAP',
        value: 'lacvCodeAttr'
      },
      organizationalAffiliation: {
        source: 'LDAP',
        value: 'o'
      }
    },
    
    attributeSources: [
      {
        type: 'LDAP',
        attributeContractFulfillment: {
          'clearanceLevel': {
            source: 'LDAP',
            value: 'clearanceLevel'
          },
          'coiMembership': {
            source: 'LDAP',
            value: 'coiMembership'
          }
        }
      }
    ]
  };
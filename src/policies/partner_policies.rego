package dive25.partner_policies

import data.access_policy.clearance
import data.access_policy.nato_nations
import data.access_policy.fvey_nations
import data.access_policy.eu_nations

basic_access_allowed = true

# Partner-specific policy definitions
partner_policies = {
    "FVEY": {
        "allowed_classifications": [
            "UNCLASSIFIED",
            "RESTRICTED",
            "NATO CONFIDENTIAL",
            "NATO SECRET"
        ],
        "required_caveats": ["FVEY"],
        "allowed_coi_tags": ["OpAlpha", "OpBravo"]
    },
    "NATO": {
        "allowed_classifications": [
            "UNCLASSIFIED",
            "RESTRICTED",
            "NATO CONFIDENTIAL",
            "NATO SECRET",
            "COSMIC TOP SECRET"
        ],
        "required_caveats": [],
        "allowed_coi_tags": ["OpAlpha", "OpBravo", "OpGamma", "MissionX", "MissionZ"]
    },
    "EU": {
        "allowed_classifications": [
            "UNCLASSIFIED",
            "RESTRICTED",
            "NATO CONFIDENTIAL"
        ],
        "required_caveats": ["EU"],
        "allowed_coi_tags": ["MissionX"]
    }
}

# Partner-specific access control
allow = true if {
    basic_access_allowed
    partner_specific_rules_satisfied
}

# Check if partner has access to the classification level
partner_specific_rules_satisfied = true if {
    partner_type := get_partner_type(input.user.countryOfAffiliation)
    policy := partner_policies[partner_type]
    
    # Check classification level
    input.resource.classification in policy.allowed_classifications
    
    # Check required caveats
    all_required_caveats_present(policy.required_caveats)
    
    # Check COI tags
    all_coi_tags_allowed(policy.allowed_coi_tags)
}

# Helper functions
get_partner_type(country) = "FVEY" if {
    fvey_nations[country]
}

get_partner_type(country) = "NATO" if {
    nato_nations[country]
}

get_partner_type(country) = "EU" if {
    eu_nations[country]
}

all_required_caveats_present(required_caveats) if {
    count(required_caveats) == 0
}

all_required_caveats_present(required_caveats) if {
    count(required_caveats) > 0
    every caveat in required_caveats {
        caveat in input.user.caveats
    }
}

all_coi_tags_allowed(allowed_tags) if {
    count(input.resource.coiTags) == 0
}

all_coi_tags_allowed(allowed_tags) if {
    count(input.resource.coiTags) > 0
    every tag in input.resource.coiTags {
        tag in allowed_tags
    }
}
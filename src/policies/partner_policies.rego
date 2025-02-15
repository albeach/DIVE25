package dive25.partner_policies

import data.access_policy.clearance
import data.access_policy.nato_nations
import data.access_policy.fvey_nations
import data.access_policy.eu_nations

basic_access_allowed = true

# Partner-specific policy definitions.
# Note: Allowed classifications are defined using partner terminology.
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

# The main rule grants access if basic access is allowed and all partner-specific
# conditions are satisfied.
allow = true if {
    basic_access_allowed
    partner_specific_rules_satisfied
}

error = ""

partner_specific_rules_satisfied = true if {
    partner_type := get_partner_type(input.user.countryOfAffiliation)
    policy := partner_policies[partner_type]

    # Check that the resource's classification (after normalization)
    # is among the allowed classifications (also normalized).
    normalize_classification(input.resource.classification) in 
        [ normalize_classification(c) | c := policy.allowed_classifications[_] ]

    # Ensure the user’s numeric clearance is sufficient.
    clearance[input.user.clearance] >= clearance[normalize_classification(input.resource.classification)]

    # Verify that any required caveats are present.
    all_required_caveats_present(policy.required_caveats)

    # Verify that the document’s Communities of Interest (COI) tags are allowed.
    all_coi_tags_allowed(policy.allowed_coi_tags)
}

# Helper function: get_partner_type returns the partner type for a given country.
get_partner_type(country) = "FVEY" if {
    fvey_nations[country]
}

get_partner_type(country) = "NATO" if {
    nato_nations[country]
}

get_partner_type(country) = "EU" if {
    eu_nations[country]
}

# Verifies that all required caveats (if any) are present in the user’s caveats.
all_required_caveats_present(required_caveats) if {
    count(required_caveats) == 0
}

all_required_caveats_present(required_caveats) if {
    count(required_caveats) > 0
    every caveat in required_caveats {
        caveat in input.user.caveats
    }
}

# Verifies that all COI tags on the resource are allowed.
# If there are no COI tags on the resource, the allowed_tags parameter is unused.
all_coi_tags_allowed(_) if {
    count(input.resource.coiTags) == 0
}

all_coi_tags_allowed(allowed_tags) if {
    count(input.resource.coiTags) > 0
    every tag in input.resource.coiTags {
        tag in allowed_tags
    }
}

# normalize_classification maps partner-specific classifications to the standard
# keys found in the clearance mapping.
normalize_classification(classification) = normalized if {
    classification == "NATO CONFIDENTIAL"
    normalized := "CONFIDENTIAL"
}

normalize_classification(classification) = normalized if {
    classification == "NATO SECRET"
    normalized := "SECRET"
}

normalize_classification(classification) = normalized if {
    classification == "COSMIC TOP SECRET"
    normalized := "TOP SECRET"
}

# If no normalization is needed, the classification remains unchanged.
normalize_classification(classification) = classification if {
    not classification == "NATO CONFIDENTIAL"
    not classification == "NATO SECRET"
    not classification == "COSMIC TOP SECRET"
}

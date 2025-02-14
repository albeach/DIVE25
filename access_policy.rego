###############################################################################
#  NATO ABAC Access Policy with Extended Attributes and Error Handling
#
#  This policy enforces access decisions based on user attributes and resource
#  metadata in a multi-partner NATO environment. It integrates STANAG-driven 
#  rules (4774, 4778, 5636) with controlled enumerations including classification
#  levels, releasability markers, COI tags, and LACV codes.
#
#  Components:
#    - Mandatory Attributes Check
#    - Classification Comparison
#    - Releasability Check for NATO/EU/Partner
#    - Communities of Interest (COI) Verification
#    - Optional LACV Code Verification
###############################################################################

package access_policy

default allow = false

###############################################################################
# 1. Enumerations and Controlled Mappings
###############################################################################
clearance = {
  "UNCLASSIFIED":          0,
  "RESTRICTED":            1,
  "CONFIDENTIAL":          2,
  "SECRET":                3,
  "TOP SECRET":            4
}

nato_nations = {
  "ALB": true,
  "BGR": true,
  "HRV": true,
  "CZE": true,
  "DNK": true,
  "EST": true,
  "FIN": true,
  "GRC": true,
  "HUN": true,
  "ISL": true,
  "LVA": true,
  "LTU": true,
  "LUX": true,
  "MNE": true,
  "MKD": true,
  "NOR": true,
  "POL": true,
  "PRT": true,
  "ROU": true,
  "SVK": true,
  "SVN": true,
  "SWE": true,
  "USA": true,
  "GBR": true,
  "FRA": true,
  "DEU": true,
  "CAN": true,
  "ITA": true,
  "NLD": true,
  "BEL": true,
  "ESP": true,
  "TUR": true
}

fvey_nations = {
  "AUS": true,
  "CAN": true,
  "NZL": true,
  "GBR": true,
  "USA": true
}

eu_nations = {
  "FRA": true,
  "DEU": true,
  "ITA": true,
  "ESP": true,
  "BEL": true,
  "NLD": true
}

valid_coi_tags = {
  "OpAlpha": true,
  "OpBravo": true,
  "OpGamma": true,
  "MissionX": true,
  "MissionZ": true
}

valid_lacv_codes = {
  "LACV001": true,
  "LACV002": true,
  "LACV003": true,
  "LACV004": true
}

###############################################################################
# 2. Required Attributes
###############################################################################
required_user_attrs = [
  "uniqueIdentifier",
  "countryOfAffiliation",
  "clearance"
]

###############################################################################
# 3. Main Access Rule
###############################################################################
allow if {
  user_has_mandatory_attrs
  user_clearance_ok
  user_releasability_ok
  user_coi_ok
  optional_lacv_ok
}

###############################################################################
# 4. Mandatory Attributes Check
###############################################################################
user_has_mandatory_attrs if {
  count(missing_attrs) == 0
}

missing_attrs = [
  attr |
  required_user_attrs[_] == attr
  attr_missing(attr)
]

attr_missing(attr) if {
  not attr in {k | k := input.user[_]}
}

attr_missing(attr) if {
  attr in {k | k := input.user[_]}
  input.user[attr] == ""
}

###############################################################################
# 5. Clearance Verification
###############################################################################
user_clearance_ok if {
  clearance_order[input.user.clearance] >= clearance_order[input.resource.clearance]
}

###############################################################################
# 6. Releasability Verification
###############################################################################
user_releasability_ok if {
  some label in input.resource.releasableTo
  user_has_access_label(label)
}

user_has_access_label(label) if {
  label == "NATO"
  nato_nations[input.user.countryOfAffiliation]
}

user_has_access_label(label) if {
  label == "EU"
  eu_nations[input.user.countryOfAffiliation]
}

user_has_access_label[label] if {
  label == "FVEY"
  fvey_nations[input.user.countryOfAffiliation]
}

user_has_access_label(label) if {
  label == "PARTNERX"
  input.user.countryOfAffiliation == "PARTNERX"
}

###############################################################################
# 7. Communities of Interest (COI) Verification
###############################################################################
user_coi_ok if {
  not input.resource.coiTags
}

user_coi_ok if {
  input.resource.coiTags
  is_array(input.resource.coiTags)
  all_coi_tags_valid(input.resource.coiTags)
  subset(input.resource.coiTags, input.user.coiTags)
}

all_coi_tags_valid(doc_tags) if {
  every t in doc_tags {
    valid_coi_tags[t]
  }
}

subset(required, have) if {
  every r in required {
    r in have
  }
}

###############################################################################
# 8. Optional LACV Verification
###############################################################################
optional_lacv_ok if {
  not input.resource.lacvCode
}

optional_lacv_ok if {
  input.resource.lacvCode
  input.user.lacvCode
  valid_lacv_codes[input.user.lacvCode]
}

optional_lacv_ok if {
  input.resource.lacvCode
  input.user.clearance == "TOP SECRET"
}

###############################################################################
# 9. Helper Functions
###############################################################################
is_array(x) = true {
  count(x) >= 0
}

is_array(x) = false {
  not count(x)
}

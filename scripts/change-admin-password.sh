#!/bin/bash

# Set default values for environment variables if not defined
: "${ROOT_USER:=Administrator}"
: "${pingaccess_private_port:=9000}"

# Existing logic to check authentication results and update password
# Check to see if the default initial administrator password authenticated correctly.
if test "${https_result_code}" = "200"; then
    # Accepted the EULA
    accept_administrator_eula "${PA_ADMIN_PASSWORD_INITIAL}"

    # Change the administrator password
    if test -n "${PING_IDENTITY_PASSWORD}"; then
        echo "INFO: Changing administrator password"

        # Toggle on debug logging if DEBUG=true is set
        start_debug_logging
        https_result_code=$(
            curl \
                --insecure \
                --silent \
                --write-out '%{http_code}' \
                --output "${pingaccess_api_out}" \
                --request PUT \
                --user "${ROOT_USER}:${PA_ADMIN_PASSWORD_INITIAL}" \
                --header "X-Xsrf-Header: PingAccess" \
                --data '{"currentPassword": "'"${PA_ADMIN_PASSWORD_INITIAL}"'", "newPassword": "'"${PING_IDENTITY_PASSWORD}"'"}' \
                "https://localhost:${pingaccess_private_port}/pa-admin-api/v3/users/1/password" \
                2> /dev/null
        )
        # Toggle off debug logging
        stop_debug_logging

        if test "${https_result_code}" != "200"; then
            cat "${pingaccess_api_out}"
            container_failure 83 "ERROR: Administrator password change not accepted"
        fi
    else
        container_failure 83 "ERROR: PING_IDENTITY_PASSWORD is not defined"
    fi
else
    container_failure 83 "ERROR: No valid administrator password found - Check variables PING_IDENTITY_PASSWORD and PA_ADMIN_PASSWORD_INITIAL"
fi

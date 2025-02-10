# dive25/server-profiles/pingaccess/instance/hooks/50-before-post-start.sh
#!/usr/bin/env sh
echo "Setting up PingAccess passwords..."
export PING_IDENTITY_PASSWORD="2FederateM0re!"
export PA_ADMIN_PASSWORD_INITIAL="2FederateM0re"
export INITIAL_ADMIN_PASSWORD="2FederateM0re"
exit 0
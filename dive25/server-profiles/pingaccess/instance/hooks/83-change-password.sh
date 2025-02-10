ADMIN_PASSWORD="${PA_ADMIN_PASSWORD_INITIAL:-${PING_IDENTITY_PASSWORD}}"
echo "admin.password=${ADMIN_PASSWORD}" > /opt/in/instance/conf/password.properties
chmod 600 /opt/in/instance/conf/password.properties
echo "Initial password configuration complete"
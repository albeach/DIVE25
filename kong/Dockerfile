FROM kong:3.5

# Install required plugins
USER root

# Install OIDC plugin
RUN luarocks install kong-oidc

# Install additional security plugins
RUN luarocks install kong-jwt-claim-headers
RUN luarocks install kong-response-size-limiting

# Switch back to kong user
USER kong 
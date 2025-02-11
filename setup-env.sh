#!/bin/bash
# setup-env.sh

if [ -f .env ]; then
    read -p ".env file already exists. Overwrite? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

cp .env.example .env

echo "Please enter the following configuration values:"

read -p "Ping Identity DevOps Username: " ping_user
read -p "Ping Identity DevOps Key: " ping_key
read -s -p "WordPress DB Password: " wp_password
echo
read -s -p "MongoDB Root Password: " mongo_password
echo
read -s -p "Grafana Admin Password: " grafana_password
echo

sed -i.bak "s/your_username/$ping_user/" .env
sed -i.bak "s/your_key/$ping_key/" .env
sed -i.bak "s/changeme_wp/$wp_password/" .env
sed -i.bak "s/changeme_mongo/$mongo_password/" .env
sed -i.bak "s/changeme_grafana/$grafana_password/" .env

rm .env.bak

chmod 600 .env

echo "Environment file created successfully!"
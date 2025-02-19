#!/bin/sh
# wait-for-it.sh

set -e

host="$1"
shift
cmd="$@"

until nc -z -v -w30 $host; do
  echo "Waiting for $host to be ready..."
  sleep 1
done

echo "$host is up - executing command"
exec $cmd 
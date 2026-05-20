#!/bin/sh
set -eu

output="${NGINX_REALIP_CONF_PATH:-/tmp/nginx-realip/realip.conf}"
mkdir -p "$(dirname "$output")"
: > "$output"

trusted_cidrs="${NGINX_TRUSTED_PROXY_CIDR:-}"
if [ -z "$trusted_cidrs" ]; then
  exit 0
fi

for cidr in $trusted_cidrs; do
  printf 'set_real_ip_from %s;\n' "$cidr" >> "$output"
done

{
  printf 'real_ip_header X-Forwarded-For;\n'
  printf 'real_ip_recursive on;\n'
} >> "$output"

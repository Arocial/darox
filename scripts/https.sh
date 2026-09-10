#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: npm run https -- <host[:port]>... [--manager <upstream>] [--web <upstream>]"
  echo "At least one host or IP address is required; default port: 3143"
  echo "Manager upstream: --manager (default: DAROX_MANAGER_UPSTREAM or 127.0.0.1:3145)"
  echo "Web upstream: --web (default: DAROX_WEB_UPSTREAM or 127.0.0.1:3140)"
}

addresses=()
manager_upstream="${DAROX_MANAGER_UPSTREAM:-127.0.0.1:3145}"
web_upstream="${DAROX_WEB_UPSTREAM:-127.0.0.1:3140}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --manager|--web)
      option="$1"
      if [[ $# -lt 2 || -z "$2" ]]; then
        echo "$option requires an upstream address." >&2
        usage >&2
        exit 1
      fi
      if [[ "$option" == "--manager" ]]; then
        manager_upstream="$2"
      else
        web_upstream="$2"
      fi
      shift 2
      ;;
    --manager=*|--web=*)
      option="${1%%=*}"
      upstream="${1#*=}"
      if [[ -z "$upstream" ]]; then
        echo "$option requires an upstream address." >&2
        exit 1
      fi
      if [[ "$option" == "--manager" ]]; then
        manager_upstream="$upstream"
      else
        web_upstream="$upstream"
      fi
      shift
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
    *)
      addresses+=("$1")
      shift
      ;;
  esac
done

if [[ ${#addresses[@]} -eq 0 ]]; then
  usage >&2
  exit 1
fi

if ! command -v caddy >/dev/null 2>&1; then
  echo "Caddy is required on PATH." >&2
  exit 1
fi

normalized_addresses=()
for address in "${addresses[@]}"; do
  if [[ ! "$address" =~ ^([a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(:([0-9]+))?$ ]]; then
    echo "Invalid address '$address': expected a hostname or IP address with an optional port, without a scheme or path." >&2
    exit 1
  fi

  port="${BASH_REMATCH[3]:-3143}"
  port_number=$((10#$port))
  if (( port_number < 1 || port_number > 65535 )); then
    echo "Invalid port in address '$address': expected a value from 1 to 65535." >&2
    exit 1
  fi

  address="${BASH_REMATCH[1]}:$port_number"
  normalized_addresses+=("$address")
done

export DAROX_HTTPS_ADDRESSES
DAROX_HTTPS_ADDRESSES="${normalized_addresses[0]}"
for ((i = 1; i < ${#normalized_addresses[@]}; i++)); do
  DAROX_HTTPS_ADDRESSES+=", ${normalized_addresses[i]}"
done
export DAROX_MANAGER_UPSTREAM="$manager_upstream"
export DAROX_WEB_UPSTREAM="$web_upstream"

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
echo "Darox HTTPS addresses:"
for address in "${normalized_addresses[@]}"; do
  echo "  https://$address"
done
echo "Manager upstream: $DAROX_MANAGER_UPSTREAM"
echo "Web upstream: $DAROX_WEB_UPSTREAM"
echo "Use any URL above as the Manager URL in Darox; keep Manager token authentication enabled."
echo "Trust this Caddy instance's root CA on every client device before installing the PWA."
exec caddy run --config "$script_dir/Caddyfile" --adapter caddyfile

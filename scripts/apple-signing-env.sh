#!/usr/bin/env bash
# CI, macOS: passes the Apple secrets on to the following steps, but only the ones that are set
# (docs/release.md). GitHub turns a missing secret into an empty string, and the Tauri bundler
# treats a variable that exists as given, even when it is empty: an empty APPLE_CERTIFICATE is
# imported as a certificate, and empty APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID start a
# notarization that fails. Without a certificate the bundle keeps the ad-hoc signature from
# tauri.conf.json (bundle.macOS.signingIdentity "-").
set -euo pipefail

# Appends NAME=value to $GITHUB_ENV in the multi-line form (a base64 .p12 may contain newlines).
pass_on() {
  local delim="EOF_${RANDOM}${RANDOM}${RANDOM}"
  printf '%s<<%s\n%s\n%s\n' "$1" "$delim" "${!1}" "$delim" >>"$GITHUB_ENV"
}

if [[ -z "${APPLE_CERTIFICATE:-}" ]]; then
  echo "APPLE_CERTIFICATE not set: ad-hoc signature, no notarization"
  exit 0
fi

# APPLE_SIGNING_IDENTITY overrides the "-" from tauri.conf.json. Without it the bundler compares
# the certificate with "-" and stops.
for name in APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY; do
  if [[ -z "${!name:-}" ]]; then
    echo "::error::APPLE_CERTIFICATE is set but $name is not"
    exit 1
  fi
done
pass_on APPLE_CERTIFICATE
pass_on APPLE_CERTIFICATE_PASSWORD
pass_on APPLE_SIGNING_IDENTITY
echo "signing with the certificate from APPLE_CERTIFICATE"

# Notarization only with all three; a self-signed certificate cannot be notarized, so leave them out.
if [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  pass_on APPLE_ID
  pass_on APPLE_PASSWORD
  pass_on APPLE_TEAM_ID
  echo "notarizing"
elif [[ -n "${APPLE_ID:-}${APPLE_PASSWORD:-}${APPLE_TEAM_ID:-}" ]]; then
  echo "::error::APPLE_ID, APPLE_PASSWORD and APPLE_TEAM_ID must be set together (or none of them)"
  exit 1
else
  echo "APPLE_ID not set: no notarization"
fi

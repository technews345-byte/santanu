#!/usr/bin/env bash
# Scans every commit on every branch for keys, tokens and private keys.
# Matches are printed redacted (never the value itself). A match whose SHA-256 fingerprint is listed in
# .github/secret-scan-allow.txt is reported as a warning only; any other match fails the check.
set -euo pipefail
allow_file=.github/secret-scan-allow.txt
pattern='AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY|"private_key"[[:space:]]*:|rzp_live_[0-9A-Za-z]{10,}|gh[pousr]_[0-9A-Za-z]{30,}|sk_live_[0-9A-Za-z]{20,}|xox[baprs]-[0-9A-Za-z-]{10,}|["'"'"'=:[:space:]]EAA[0-9A-Za-z]{30,}|(JWT_SECRET|ADMIN_PASSWORD|RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET|WHATSAPP_ACCESS_TOKEN|WHATSAPP_APP_SECRET|SMTP_PASS|FIREBASE_SERVICE_ACCOUNT)[[:space:]]*[=:][[:space:]]*["'"'"']?[A-Za-z0-9_+/-]{12,}'
allowed=$(grep -oE '^[0-9a-f]{64}' "$allow_file" 2>/dev/null || true)
declare -A seen
fail=0 warn=0 commits=0
for c in $(git rev-list --all); do
  commits=$((commits+1))
  while IFS=: read -r _ file _ content; do
    while IFS= read -r value; do
      [ -z "$value" ] && continue
      fp=$(printf '%s' "$value" | sha256sum | cut -c1-64)
      [ -n "${seen[$fp|$file]:-}" ] && continue
      seen[$fp|$file]=1
      shown="${value:0:6}… sha256:${fp:0:12}"
      if grep -qx "$fp" <<<"$allowed"; then
        echo "::warning::Accepted key in $file ($shown), commit ${c:0:9}"; warn=$((warn+1))
      else
        echo "::error::Possible secret in $file ($shown), commit ${c:0:9}"; fail=$((fail+1))
      fi
    done < <(grep -oE "$pattern" <<<"$content" || true)
  done < <(git grep -InE "$pattern" "$c" -- . ':!*package-lock.json' ':!*.env.example' ':!.github/scripts/scan-secrets.sh' ':!bowl-mania-site/test/*' 2>/dev/null || true)
done
echo "Scanned $commits commits: $fail possible secret(s), $warn accepted."
if [ "$fail" -ne 0 ]; then
  echo "::error::Rotate any real secret at its provider and remove it from the history. A public client key (e.g. Firebase) can instead be restricted in Google Cloud and its full sha256 added to $allow_file."
  exit 1
fi

#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

history_ref="${PRIVACY_HISTORY_REF:-HEAD}"
patterns='(sb_secret_|service_role[^[:alnum:]_]+[A-Za-z0-9._-]{16,}|-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|appgprj_[A-Za-z0-9]{20,}|https://[a-z0-9]{20}\.supabase\.co)'

while IFS= read -r commit; do
  if git grep -Il -E "$patterns" "$commit" -- . \
      ':(exclude)scripts/privacy-scan.sh' \
      ':(exclude)scripts/privacy-history-scan.sh' >/dev/null 2>&1; then
    echo "Privacy history scan failed: secret-shaped content exists in reachable history."
    exit 1
  fi
done < <(git rev-list "$history_ref")

echo "Privacy history scan passed."


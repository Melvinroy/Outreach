#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

mapfile -t release_files < <(git ls-files --cached --others --exclude-standard | while IFS= read -r file; do
  [[ -f "$file" && "$file" != "scripts/privacy-scan.sh" && "$file" != "scripts/privacy-history-scan.sh" ]] && printf '%s\n' "$file"
done)
if [[ ${#release_files[@]} -eq 0 ]]; then
  echo "No tracked files found."
  exit 1
fi

patterns='(sb_secret_|service_role[^[:alnum:]_]+[A-Za-z0-9._-]{16,}|-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|appgprj_[A-Za-z0-9]{20,})'
if rg -n --pcre2 "$patterns" "${release_files[@]}"; then
  echo "Privacy scan failed: installation-specific or secret-shaped value found."
  exit 1
fi

if [[ -f .privacy-denylist ]]; then
  while IFS= read -r value; do
    [[ -z "$value" || "$value" == \#* ]] && continue
    if rg -n -F -- "$value" "${release_files[@]}"; then
      echo "Privacy scan failed: a local denylist value was found."
      exit 1
    fi
  done < .privacy-denylist
fi

echo "Privacy scan passed."

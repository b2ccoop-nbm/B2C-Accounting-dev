#!/usr/bin/env bash
# Normalize pasted Cloudflare API token (single cfut_ prefix).
normalize_cloudflare_token() {
  local raw="$1"
  raw="${raw//$'\r'/}"
  raw="${raw//$'\n'/}"
  raw="${raw#"${raw%%[![:space:]]*}"}"
  raw="${raw%"${raw##*[![:space:]]}"}"
  raw="${raw#\"}"
  raw="${raw%\"}"
  raw="${raw#\'}"
  raw="${raw%\'}"

  if [[ "$raw" == *"Authorization: Bearer "* ]]; then
    raw="${raw#*Authorization: Bearer }"
    raw="${raw%%\"*}"
    raw="${raw%% *}"
  elif [[ "$raw" == *"Bearer "* ]]; then
    raw="${raw#*Bearer }"
    raw="${raw%% *}"
  fi

  # Longest cfut_* segment (skip cfut_curl from pasted curl examples)
  local best="" match
  while IFS= read -r match; do
    [[ "$match" == "cfut_curl" ]] && continue
    [[ ${#match} -gt ${#best} ]] && best="$match"
  done < <(grep -oE 'cfut_[A-Za-z0-9_-]+' <<<"$raw" 2>/dev/null || true)
  if [[ -n "$best" ]]; then
    raw="$best"
  fi

  # cfut_cfut_... means cfut_ was typed twice — keep one prefix
  while [[ "$raw" == cfut_cfut_* ]]; do
    raw="${raw#cfut_}"
  done

  printf '%s' "$raw"
}

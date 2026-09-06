// Sync results describe recorded work, never current provider authentication.
export function diagnosticText(value = "") {
  return value
    .replace(/(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted]")
    .replace(
      /(["']?(?:access_token|refresh_token|token|password|secret|api[_-]?key|authorization)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s&,;]+)/gi,
      "$1[redacted]",
    )
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[redacted]@");
}

export function connectionStatus(records = [], sample = false) {
  const known = records.filter(Boolean);
  if (sample || !known.length) return "Not verified";
  if (
    known.some(
      (r) =>
        r.error ||
        ["failed", "blocked", "partial", "incomplete"].includes(r.state),
    )
  )
    return "Needs attention";
  if (known.some((r) => ["running", "claimed"].includes(r.state)))
    return "Syncing";
  if (
    known.every(
      (r) =>
        ["completed", "succeeded"].includes(r.state) &&
        Number.isFinite(Date.parse(r.last_success_at)),
    )
  )
    return "Up to date";
  return "Not verified";
}

export function sendingStatus(execution, sample = false) {
  if (
    sample ||
    !execution?.adapter ||
    ["demo", "none", "not_configured", "unconfigured"].includes(
      execution.adapter,
    )
  )
    return "Unavailable";
  return execution.outbound_enabled ? "Available" : "Paused";
}

export function validateInvitationPreferences(days, threshold, mode) {
  if (!Number.isInteger(Number(days)) || Number(days) < 7 || Number(days) > 90)
    return "Enter a review age from 7 to 90 days.";
  if (
    threshold !== "" &&
    (!Number.isInteger(Number(threshold)) || Number(threshold) < 1)
  )
    return "Enter a positive whole number for the pending threshold, or leave it blank.";
  if (!["warn", "hold", "cleanup"].includes(mode))
    return "Choose a threshold behavior.";
  return "";
}

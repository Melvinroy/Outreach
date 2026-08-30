const OUTREACH_HOST = "melvinroy.github.io";
const OUTREACH_PATH = "/Outreach";
const OUTREACH_SUPABASE_URL = "https://phknvjttkjatzbhgnera.supabase.co";
const OUTREACH_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_SiuQIykUilO5WO7edQhylw_4RNmNGNg";

export function getDeploymentCloudConfig() {
  if (typeof window === "undefined") return null;
  const isOutreachPages = window.location.hostname === OUTREACH_HOST
    && (window.location.pathname === OUTREACH_PATH || window.location.pathname.startsWith(`${OUTREACH_PATH}/`));
  return isOutreachPages
    ? { url: OUTREACH_SUPABASE_URL, publishableKey: OUTREACH_SUPABASE_PUBLISHABLE_KEY }
    : null;
}

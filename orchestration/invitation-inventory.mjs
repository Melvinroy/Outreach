import { canonicalProfile } from "./connection-intake.mjs";

/** Read-only adapter: completeness must come from the provider, never a guessed count. */
export async function syncInvitationInventory({
  readPendingPage,
  recordInventory,
  now = () => new Date().toISOString(),
}) {
  const items = [],
    profiles = new Set(),
    cursors = new Set();
  let cursor,
    total,
    accountState = "unknown",
    restrictionNote,
    complete = true;
  for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
    const page = await readPendingPage({ cursor });
    if (!Array.isArray(page.items))
      throw new Error("Pending inventory page is missing");
    if (page.account_state === "restricted") {
      accountState = "restricted";
      restrictionNote = page.restriction_note;
    } else if (accountState !== "restricted" && page.account_state === "clear")
      accountState = "clear";
    complete &&= page.complete === true;
    if (page.total !== undefined) {
      if (
        !Number.isInteger(page.total) ||
        page.total < 0 ||
        (total !== undefined && total !== page.total)
      )
        throw new Error("Inventory count changed during scan");
      total = page.total;
    }
    for (const item of page.items) {
      const profile_url = canonicalProfile(item.profile_url);
      if (!profile_url || !item.full_name?.trim() || profiles.has(profile_url))
        throw new Error("Ambiguous or duplicate pending identity");
      profiles.add(profile_url);
      items.push({
        profile_url,
        full_name: item.full_name.trim(),
        sent_at: item.sent_at || null,
        employer: item.employer,
      });
    }
    if (!page.next_cursor)
      return recordInventory({
        items,
        total: total ?? items.length,
        complete: complete && total === items.length,
        observed_at: now(),
        account_state: accountState,
        restriction_note: restrictionNote,
      });
    if (cursors.has(page.next_cursor))
      throw new Error("Pending inventory pagination repeated");
    cursors.add(page.next_cursor);
    cursor = page.next_cursor;
  }
  throw new Error("Pending inventory pagination limit reached");
}

import { batchOutcomes } from './relationship-projection.mjs';
/** Saving and refreshing are separate outcomes. Never retry a write automatically. */
export function findSavedQueue(batches, items, beforeIds = []) {
  return batches.find(b => b.kind === 'invitation' && !beforeIds.includes(b.id)
    && b.items.length === items.length && items.every(item => b.items.some(saved =>
      saved.contact_id === item.contact_id && saved.text === item.text)));
}

export function queueReceipt(batch) {
  const outcome=batchOutcomes(batch);
  const uncertain=outcome.counts.uncertain+outcome.counts.blocked+outcome.counts.running > 0;
  return {
    id: batch.id, code: batch.code, count: batch.items.length,
    nothingSent: batch.items.every(i => i.status === 'prepared'),
    label: outcome.label || 'No recorded outcomes', affected:outcome.affected,
    canCopy: batch.status === 'ready' && !uncertain && batch.items.some(i => i.status === 'prepared'),
  };
}

export async function saveConnectionQueue({ rpc, refresh, items, beforeIds }) {
  let response;
  try { response = await rpc(items); }
  catch (error) { response = { error }; }
  if (!response.error && (!response.data?.batch_id || !response.data?.batch_code || response.data?.selected_count !== items.length)) {
    response = {error: {message: 'Incomplete save confirmation'}};
  }
  if (response.error) {
    // PostgreSQL/PostgREST rejection confirms the transaction did not save.
    if (/^(?:[0-9A-Z]{5}|PGRST\d+)$/.test(response.error.code || '')) {
      return { ok: false, error: response.error.message };
    }
    try {
      const snapshot = await refresh();
      const batch = findSavedQueue(snapshot.batches, items, beforeIds);
      if (batch) return { ok: true, data: { batch_id: batch.id, batch_code: batch.code, selected_count: batch.items.length } };
    } catch { /* The outcome is still unknown. */ }
    return { ok: false, uncertain: true, error: 'Save confirmation was interrupted. Check saved queue before trying again.' };
  }
  const data = response.data;
  try { await refresh(); return { ok: true, data }; }
  catch { return { ok: true, data, refreshFailed: true }; }
}

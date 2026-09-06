// Confirm one frozen invitation only; never send or clear unrelated delivery holds.
export function confirmableInvitation(contact, batches, evidenceLoaded) {
  if (!evidenceLoaded || contact.connection_status !== 'not_contacted') return null;
  const items=batches.flatMap(b=>b.items.filter(i=>i.contact_id===contact.id).map(i=>({...i,kind:b.kind})));
  if(items.some(i=>['failed','running','uncertain','awaiting_confirmation'].includes(i.status))) return null;
  const pending=items.filter(i=>i.kind==='invitation' && i.status==='prepared');
  return pending.length===1 ? pending[0] : null;
}

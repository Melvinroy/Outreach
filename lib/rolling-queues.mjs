export function allocateQueues(state, count) {
 if(!state) return {allocations:[],error:'Queue capacity is loading.'};
 if(count<1) return {allocations:[],error:'Select people who need a connection request.'};
 if(count>state.capacity) return {allocations:[],error:`Only ${state.capacity} spaces remain across four queues. Your selection is preserved.`};
 const allocations=[];let remaining=count,next=state.next_number;
 for(const q of state.queues) {
  if(q.started || q.uncertain) continue;
  const take=Math.min(remaining,15-q.remaining);
  if(take>0) {allocations.push({number:q.number,count:take,batch_id:q.id});remaining-=take;}
 }
 while(remaining>0) {const take=Math.min(remaining,15);allocations.push({number:next++,count:take});remaining-=take;}
 return {allocations,error:''};
}
export function allocationLabel(allocations) {
 return allocations.map(a=>`${a.count} ${a.count===1?'person':'people'} → Queue ${a.number}`).join(' · ');
}

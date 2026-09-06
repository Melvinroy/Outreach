import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceStartup, workspaceLoadMessage } from '../lib/workspace-startup.mjs';
const session = { user: { id: 'owner' }, access_token: 'test-token' };
test('duplicate auth notifications start one load', async () => {
  let calls = 0;
  const events = [];
  const startup = createWorkspaceStartup(async () => { calls++; return { authorized:true }; }, e => events.push(e));
  await Promise.all([startup.resolve(session), startup.resolve(session)]);
  assert.equal(calls, 1);
  assert.equal(events.filter(e => e.result).length, 1);
});
test('a pending old load cannot overwrite sign-out', async () => {
  let fail;
  const events=[];
  const startup=createWorkspaceStartup(() => new Promise((_,reject)=>{fail=reject;}),e=>events.push(e));
  const pending=startup.resolve(session);
  await startup.resolve(null);
  fail({message:'old failure'});
  await pending;
  assert.equal(events.at(-1).session,null);
  assert.equal(events.some(e=>e.error),false);
});
test('new session supersedes old success and disposal ignores completion', async () => {
  const resolve=[]; const events=[];
  const startup=createWorkspaceStartup(()=>new Promise(done=>resolve.push(done)),e=>events.push(e));
  const old=startup.resolve(session);
  const latest=startup.resolve({...session,access_token:'refreshed'});
  resolve[1]({authorized:true}); await latest;
  resolve[0]({authorized:false}); await old;
  assert.equal(events.at(-1).result.authorized,true);
  const pending=startup.resolve({...session,access_token:'next'});
  startup.dispose(); resolve[2]({authorized:false}); await pending;
  assert.equal(events.filter(e=>e.result).length,1);
});
test('plain PostgREST errors keep their message; mobile network errors suggest retry',()=>{
  assert.equal(workspaceLoadMessage({message:'Request denied'}),'Request denied');
  assert.match(workspaceLoadMessage({message:'TypeError: Load failed'}),/connection was interrupted/);
});

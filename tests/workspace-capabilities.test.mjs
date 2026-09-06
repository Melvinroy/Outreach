import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceCapabilities, canRunWorkspaceCommand} from '../lib/workspace-capabilities.mjs';

test('legacy snapshot permits local selection without any mutation capability', () => {
  const caps = workspaceCapabilities({execution: {mode: 'legacy'}});
  assert.equal(caps.selection, true);
  for (const command of ['prepare','save_draft','approve','snooze','discard']) assert.equal(canRunWorkspaceCommand(caps, command), false);
  assert.equal(workspaceCapabilities(null).selection, false);
});
test('preparation, approval and management permissions are independent', () => {
  const caps = workspaceCapabilities({capabilities: {selection: true, preparation: true, approval: false, management: false}});
  assert.equal(canRunWorkspaceCommand(caps, 'prepare'), true);
  assert.equal(canRunWorkspaceCommand(caps, 'save_draft'), true);
  assert.equal(canRunWorkspaceCommand(caps, 'approve'), false);
  assert.equal(canRunWorkspaceCommand(caps, 'discard'), false);
  assert.equal(workspaceCapabilities({capabilities: {selection: false}}).selection, false);
});

export function workspaceCapabilities(snapshot, demo = false) {
  if (demo) return { selection: true, preparation: true, approval: true, execution: true, management: true };
  const capabilities = snapshot?.capabilities;
  return {
    queue: capabilities?.queue === true,
    contactManagement: capabilities?.contact_management === true,
    selection: !!snapshot && capabilities?.selection !== false,
    preparation: capabilities?.preparation === true,
    approval: capabilities?.approval === true,
    execution: capabilities?.execution === true,
    management: capabilities?.management === true,
  };
}
export function canRunWorkspaceCommand(capabilities, command) {
  if (command === 'prepare' || command === 'save_draft') return capabilities.preparation;
  if (command === 'approve') return capabilities.approval;
  return capabilities.management;
}

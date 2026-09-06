// Auth can emit INITIAL_SESSION and SIGNED_IN for the same session.
// Only the latest distinct session may publish a load result.
export function createWorkspaceStartup(load, publish) {
  let generation = 0;
  let lastKey;
  let disposed = false;
  return {
    async resolve(session) {
      if (disposed) return;
      const key = session ? `${session.user.id}:${session.access_token}` : null;
      if (key === lastKey) return;
      lastKey = key;
      const current = ++generation;
      publish({ session, loading: !!session });
      if (!session) return;
      try {
        const result = await load(session);
        if (!disposed && current === generation) publish({ session, result });
      } catch (error) {
        if (!disposed && current === generation) publish({ session, error });
      }
    },
    dispose() { disposed = true; generation++; },
  };
}

export function workspaceLoadMessage(error) {
  const message = error && typeof error.message === 'string' ? error.message : '';
  if (/fetch|network|load failed|connection|timeout/i.test(message)) {
    return 'The connection was interrupted while loading your workspace. Check your connection and try again.';
  }
  return message || 'Your workspace could not be loaded. Please try again.';
}

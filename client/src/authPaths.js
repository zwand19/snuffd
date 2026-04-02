export function appBasePath() {
  return (
    window.location.origin +
    (window.location.pathname.includes('/snuffd') ? '/snuffd' : '')
  );
}

/** Use on Login so users can pick a different account after logout (mobile-friendly). */
export const loginSelectAccountParams = { prompt: 'select_account' };

export function registerOfflineWorker() {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
  const register = async () => {
    try {
      const base = new URL(`${process.env.PUBLIC_URL || ''}/`, window.location.href);
      if (base.origin !== window.location.origin) return;
      await navigator.serviceWorker.register(new URL('sw-budget.js', base).href, { scope: base.pathname, updateViaCache: 'none' });
      await navigator.storage?.persist?.();
    } catch (error) { console.warn('SpendSmart offline installation failed', error); }
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', register, { once: true });
}

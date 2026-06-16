export const appName = 'aidx';
export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';

// Docs are dev-only. Prod redirects unless VITE_DOCS_ENABLED is set (private preview deploy).
export const docsEnabled = import.meta.env.DEV || import.meta.env.VITE_DOCS_ENABLED === 'true';

export const gitConfig = {
  user: 'omridevk',
  repo: 'aidx',
  branch: 'main',
};

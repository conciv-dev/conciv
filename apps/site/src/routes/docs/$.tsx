import { createFileRoute, redirect } from '@tanstack/react-router';

// Docs are disabled pre-launch. Content stays in the repo, just unserved.
// Re-enable by restoring the fumadocs DocsLayout route (see git history).
export const Route = createFileRoute('/docs/$')({
  beforeLoad: () => {
    throw redirect({ to: '/' });
  },
});

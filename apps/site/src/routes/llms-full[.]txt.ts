import { createFileRoute } from '@tanstack/react-router';
import { source, getLLMText } from '@/lib/source';
import { docsEnabled } from '@/lib/shared';

export const Route = createFileRoute('/llms-full.txt')({
  server: {
    handlers: {
      GET: async () => {
        if (!docsEnabled) return new Response(null, { status: 404 });
        const scan = source.getPages().map(getLLMText);
        const scanned = await Promise.all(scan);
        return new Response(scanned.join('\n\n'));
      },
    },
  },
});

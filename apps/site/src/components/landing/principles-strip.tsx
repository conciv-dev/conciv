type Principle = {title: string; body: string}

const PRINCIPLES: Principle[] = [
  {
    title: 'One integration',
    body: 'Add the plugin to your Vite, Next.js, webpack, or Rspack dev build. Dev-only; nothing ships to production.',
  },
  {
    title: 'The real DOM',
    body: 'Point at any element. The agent gets the live node, its source location, and its state.',
  },
  {
    title: 'Your machine',
    body: 'Your code and prompts never pass through conciv servers. No conciv account or API key — bring your own Claude Code or Codex CLI.',
  },
]

export function PrinciplesStrip() {
  return (
    <section className="grid grid-cols-1 gap-8 px-8 py-12 sm:grid-cols-3">
      {PRINCIPLES.map((principle) => (
        <div key={principle.title}>
          <h3 className="text-[15px] font-semibold">{principle.title}</h3>
          <p className="mt-1.5 text-[14px] text-muted-foreground">{principle.body}</p>
        </div>
      ))}
    </section>
  )
}

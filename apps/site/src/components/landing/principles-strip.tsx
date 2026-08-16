type Principle = {title: string; body: string}

const PRINCIPLES: Principle[] = [
  {
    title: 'One integration',
    body: 'One plugin line in your dev build. Dev-only.',
  },
  {
    title: 'The real DOM',
    body: 'The live node, its source line, and its state.',
  },
  {
    title: 'Your machine',
    body: 'Your own Claude Code or Codex CLI, locally.',
  },
]

export function PrinciplesStrip() {
  return (
    <section className="od-ruled">
      <div className="od-page">
        <div className="od-col">
          <ul className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {PRINCIPLES.map((principle) => (
              <li key={principle.title} className="od-inset flex flex-col gap-2 py-6">
                <h3 className="od-h3">{principle.title}</h3>
                <p className="od-caption text-muted-foreground">{principle.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

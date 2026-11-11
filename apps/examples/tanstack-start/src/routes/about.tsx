import {createFileRoute} from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

const PILLARS = [
  ['Type-safe routes', 'File-based routing with generated types, so links and params never drift from the code.'],
  ['Server functions', 'Call server code straight from a component without hand-rolling an API layer.'],
  ['SSR and streaming', 'Modern rendering defaults out of the box — no extra configuration to opt in.'],
  ['Design tokens', 'One CSS custom-property set drives light and dark across every page.'],
]

const STACK = [
  ['React', '19'],
  ['TanStack Start', 'latest'],
  ['TanStack Form', 'latest'],
  ['Tailwind CSS', '4'],
  ['Vitest', '4'],
]

const STRUCTURE = [
  ['src/routes', 'One file per route, plus the generated route tree.'],
  ['src/components', 'Header, footer, and the theme toggle.'],
  ['src/lib', 'Small helpers with their own unit tests.'],
  ['conciv/extensions', 'The agent-side extensions this demo registers.'],
]

function About() {
  return (
    <main className="page-wrap px-4 pb-10 pt-10 sm:pt-14">
      <section className="island-shell island-raised rise-in relative overflow-hidden rounded-[1.75rem] px-6 py-9 sm:px-9 sm:py-11">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,var(--accent-soft),transparent_68%)]" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:items-center">
          <div>
            <span className="eyebrow mb-4">
              <span className="eyebrow-dot" />
              About
            </span>
            <h1 className="display-title mb-4 max-w-[15ch] text-4xl font-bold text-[var(--sea-ink)] sm:text-[3.25rem]">
              A small starter with room to grow.
            </h1>
            <p className="lede m-0 max-w-[46ch]">
              TanStack Start gives you type-safe routing, server functions, and modern SSR defaults. Use this as a clean
              foundation, then layer in your own routes, styling, and add-ons.
            </p>
          </div>
          <div className="island-shell rounded-[1.25rem] p-4 sm:p-5">
            <p className="island-kicker mb-3">In the box</p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {STACK.map(([name, version]) => (
                <li key={name} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold text-[var(--sea-ink)]">{name}</span>
                  <span className="mono field-hint">{version}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2">
        {PILLARS.map(([title, desc], index) => (
          <article key={title} className="feature-card rise-in" style={{animationDelay: `${index * 70 + 60}ms`}}>
            <span className="feature-mark mono mb-3">{index + 1}</span>
            <h2 className="mb-1.5 text-[0.9375rem] font-bold text-[var(--sea-ink)]">{title}</h2>
            <p className="m-0 text-sm leading-6 text-[var(--sea-ink-soft)]">{desc}</p>
          </article>
        ))}
      </section>

      <section className="island-shell mt-5 rounded-[1.5rem] p-6 sm:p-7">
        <div className="section-head mb-4">
          <h2 className="section-title">Where things live</h2>
          <p className="section-hint">Four folders, nothing hidden</p>
        </div>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {STRUCTURE.map(([path, desc]) => (
            <li key={path} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
              <code className="mono shrink-0">{path}</code>
              <span className="text-sm text-[var(--sea-ink-soft)]">{desc}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

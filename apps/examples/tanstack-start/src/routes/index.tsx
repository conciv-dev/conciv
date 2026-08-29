import {createFileRoute} from '@tanstack/react-router'

export const Route = createFileRoute('/')({component: App})

const FEATURES = [
  ['Type-Safe Routing', 'Routes and links stay in sync across every page.'],
  ['Server Functions', 'Call server code from your UI without creating API boilerplate.'],
  ['Streaming by Default', 'Ship progressively rendered responses for faster experiences.'],
  ['Tailwind Native', 'Design quickly with utility-first styling and reusable tokens.'],
]

const QUICK_START = [
  ['src/routes/index.tsx', 'Customize the home page you are looking at.'],
  ['src/components/Header.tsx', 'Swap the brand mark and navigation links.'],
  ['src/styles.css', 'Tune the design tokens every page reads from.'],
]

function App() {
  return (
    <main class="page-wrap px-4 pb-10 pt-10 sm:pt-14">
      <section class="island-shell island-raised rise-in relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
        <div class="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-[radial-gradient(circle,var(--accent-soft),transparent_66%)]" />
        <div class="pointer-events-none absolute -bottom-28 -right-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,var(--hero-b),transparent_66%)]" />
        <div class="relative grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <span class="eyebrow mb-5">
              <span class="eyebrow-dot" />
              TanStack Start base template
            </span>
            <h1 class="display-title mb-5 max-w-3xl text-4xl font-bold text-[var(--sea-ink)] sm:text-6xl">
              Start simple, ship quickly.
            </h1>
            <p class="lede mb-8">
              A deliberately light starter: a handful of routes, a clean structure, and the essentials you need to build
              from scratch — with a live agent panel already wired in.
            </p>
            <div class="flex flex-wrap gap-2.5">
              <a href="/about" class="btn btn-primary btn-round no-underline">
                About This Starter
              </a>
              <a
                href="https://tanstack.com/router"
                target="_blank"
                rel="noopener noreferrer"
                class="btn btn-ghost btn-round no-underline"
              >
                Router Guide
              </a>
            </div>
          </div>

          <aside class="island-shell rounded-[1.25rem] p-5 sm:p-6">
            <p class="island-kicker mb-3">Take the tour</p>
            <ul class="m-0 flex list-none flex-col gap-2 p-0">
              <For
                each={[
                  ['/', 'Home', 'This page — layout, tokens, and type scale.'],
                  ['/about', 'About', 'What the template ships with.'],
                  ['/form', 'Form', 'Every native control, with live state.'],
                ]}
              >
                {([href, name, desc]) => (
                  <li key={href}>
                    <a href={href} className="choice choice-block choice-link">
                      <span className="mono w-16 shrink-0 pt-0.5 text-xs font-bold text-[var(--accent)]">{href}</span>
                      <span>
                        <span className="choice-title">{name}</span>
                        <span className="choice-sub">{desc}</span>
                      </span>
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </aside>
        </div>
      </section>

      <section class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(([title, desc], index) => (
          <article class="feature-card rise-in" style={{'animation-delay': `${index * 70 + 60}ms`}}>
            <span class="feature-mark mb-3 mono">{index + 1}</span>
            <h2 class="mb-1.5 text-[0.9375rem] font-bold text-[var(--sea-ink)]">{title}</h2>
            <p class="m-0 text-sm leading-6 text-[var(--sea-ink-soft)]">{desc}</p>
          </article>
        ))}
      </section>

      <section class="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div class="island-shell rounded-[1.5rem] p-6 sm:p-7">
          <div class="section-head mb-4">
            <h2 class="section-title">Quick start</h2>
            <p class="section-hint">Three files to make it yours</p>
          </div>
          <ul class="m-0 flex list-none flex-col gap-3 p-0">
            <For each={QUICK_START}>
              {([file, desc]) => (
                <li key={file} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                  <code className="mono shrink-0">{file}</code>
                  <span className="text-sm text-[var(--sea-ink-soft)]">{desc}</span>
                </li>
              )}
            </For>
          </ul>
        </div>

        <div class="island-shell flex flex-col justify-between gap-5 rounded-[1.5rem] p-6 sm:p-7">
          <div>
            <p class="island-kicker mb-2">Playground</p>
            <h2 class="display-title mb-2 text-2xl font-bold text-[var(--sea-ink)]">Poke at every control at once.</h2>
            <p class="m-0 text-sm leading-6 text-[var(--sea-ink-soft)]">
              The form route puts text, select, radio, checkbox, range, color, date, and textarea on one screen with a
              live state panel beside it.
            </p>
          </div>
          <a href="/form" class="btn btn-primary btn-round self-start no-underline">
            Open the form demo
          </a>
        </div>
      </section>
    </main>
  )
}

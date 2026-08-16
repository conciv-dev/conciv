import {Card, CardDescription, CardHeader, CardTitle} from '@/components/ui/card'

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
    <section className="od-ruled">
      <div className="od-page">
        <div className="od-col grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {PRINCIPLES.map((principle) => (
            <Card
              key={principle.title}
              className="od-inset gap-0 rounded-none bg-transparent py-6 shadow-none ring-0 [--card-spacing:0px]"
            >
              <CardHeader className="gap-2 px-0">
                <CardTitle className="od-h3">{principle.title}</CardTitle>
                <CardDescription className="od-caption">{principle.body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}

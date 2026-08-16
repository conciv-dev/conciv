import {findScreenshot} from '@/lib/screenshots'
import {MediaFrame} from '@/components/ui/media-frame'
import {cn} from '@/lib/utils'

type Figure = {file: string; title: string; body: string}

const ROW_A: Figure[] = [
  {
    file: 'grab-element.webp',
    title: 'Grab any element',
    body: 'Crosshair-pick a node; the agent gets the element, its source line, and its state.',
  },
  {
    file: 'edit-live.webp',
    title: 'Try it live first',
    body: 'Edits land on the running page first, then in source when you say so.',
  },
]

const ROW_B: Figure[] = [
  {
    file: 'test-run.webp',
    title: 'Runs your tests',
    body: 'Run Vitest or Playwright locally; results render as cards in the thread.',
  },
  {
    file: 'permission.webp',
    title: 'Asks before risky commands',
    body: 'Approve or deny shell commands from the chat. Read-only commands just run.',
  },
  {
    file: 'whiteboard.webp',
    title: 'Draws with you',
    body: 'A shared Excalidraw canvas the agent can draw on, with source-anchored comments.',
  },
]

const ROW_C: Figure = {
  file: 'any-running-app.webp',
  title: 'Any running app',
  body: 'A local clone of vite.dev with one Vite plugin line. Nothing else changed.',
}

function CapabilityFigure({figure, className}: {figure: Figure; className?: string}) {
  const screenshot = findScreenshot(figure.file)
  return (
    <figure className={cn('od-inset flex flex-col gap-4 py-8', className)}>
      <MediaFrame
        src={`/screenshots/${screenshot.file}`}
        width={screenshot.width}
        height={screenshot.height}
        alt={screenshot.alt}
        title={figure.title}
      />
      <figcaption className="flex flex-col gap-1">
        <h3 className="od-h3">{figure.title}</h3>
        <p className="od-caption text-muted-foreground">{figure.body}</p>
      </figcaption>
    </figure>
  )
}

export function CapabilitySection() {
  return (
    <section className="od-ruled">
      <div className="od-page">
        <div className="od-col">
          <div className="od-inset py-16">
            <h2 className="od-h2">What it does on the page.</h2>
          </div>
          <div className="grid grid-cols-1 divide-y border-t md:grid-cols-2 md:divide-x md:divide-y-0">
            {ROW_A.map((figure) => (
              <CapabilityFigure key={figure.file} figure={figure} />
            ))}
          </div>
          <div className="grid grid-cols-1 divide-y border-t lg:grid-cols-3 lg:divide-x lg:divide-y-0">
            {ROW_B.map((figure) => (
              <CapabilityFigure key={figure.file} figure={figure} />
            ))}
          </div>
          <div className="border-t">
            <CapabilityFigure figure={ROW_C} />
          </div>
        </div>
      </div>
    </section>
  )
}

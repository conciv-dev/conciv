import screenshots from '../../../public/screenshots/index.json'
import {Reveal} from './reveal'

type ScreenshotEntry = (typeof screenshots)[number]

type Figure = {file: string; title: string; body: string}

const ROW_A: Figure[] = [
  {
    file: 'grab-element.webp',
    title: 'Grab any element',
    body: 'Crosshair-pick a node; the agent gets the element, its source file:line, and its live state.',
  },
  {
    file: 'edit-live.webp',
    title: 'Try it live first',
    body: 'Style and DOM edits land on the running page, ephemeral, until you ask the agent to write them to source.',
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
  body: 'Mounted on a local clone of vite.dev with one Vite plugin line. Nothing about the host changed.',
}

function findScreenshot(file: string): ScreenshotEntry {
  const entry = screenshots.find((item) => item.file === file)
  if (!entry) throw new Error(`Missing screenshot manifest entry for ${file}`)
  return entry
}

function CapabilityFigure({figure}: {figure: Figure}) {
  const screenshot = findScreenshot(figure.file)
  return (
    <figure>
      <img
        src={`/screenshots/${screenshot.file}`}
        width={screenshot.width}
        height={screenshot.height}
        alt={screenshot.alt}
        loading="lazy"
        decoding="async"
        className="od-screenshot w-full"
      />
      <figcaption className="mt-3">
        <p className="text-[15px] font-semibold">{figure.title}</p>
        <p className="mt-1 text-[14px] text-muted-foreground">{figure.body}</p>
      </figcaption>
    </figure>
  )
}

export function CapabilitySection() {
  return (
    <Reveal>
      <section className="px-8 py-14">
        <p className="od-eyebrow mb-3">On the page</p>
        <h2 className="od-h2 mb-10">The page becomes the agent's context.</h2>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {ROW_A.map((figure) => (
            <CapabilityFigure key={figure.file} figure={figure} />
          ))}
        </div>
        <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {ROW_B.map((figure) => (
            <CapabilityFigure key={figure.file} figure={figure} />
          ))}
        </div>
        <div className="mt-8">
          <CapabilityFigure figure={ROW_C} />
        </div>
      </section>
    </Reveal>
  )
}

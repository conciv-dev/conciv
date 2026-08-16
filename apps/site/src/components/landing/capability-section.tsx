import {findScreenshot} from '@/lib/screenshots'
import {MediaFrame} from '@/components/ui/media-frame'
import {cn} from '@/lib/utils'

type Story = {
  file: string
  title: string
  caption: string
  facts: [string, string, string]
  imageSide: 'left' | 'right'
}

type Evidence = {file: string; title: string; caption: string; focus?: string}

const STORIES: Story[] = [
  {
    file: 'grab-element.webp',
    title: 'Grab any element',
    caption: 'Pick a node on the live page; the agent gets its markup and source line.',
    facts: [
      'Hover to pick, straight over the running DOM',
      'Source file and line stamped at build time',
      'Snippet and source ride into the composer',
    ],
    imageSide: 'left',
  },
  {
    file: 'edit-live.webp',
    title: 'Try it live first',
    caption: 'Edits land on the running page first, then in source when you say so.',
    facts: [
      'Live style and text edits, no reload',
      'Source edits show a before and after diff',
      'Keep it, and the agent edits the source',
    ],
    imageSide: 'right',
  },
]

const EVIDENCE: Evidence[] = [
  {file: 'test-run.webp', title: 'Runs your tests', caption: 'Vitest or Playwright, results as cards in the thread.'},
  {
    file: 'permission.webp',
    title: 'Asks before risky commands',
    caption: 'Shell commands ask first; read-only ones just run.',
  },
  {
    file: 'whiteboard.webp',
    title: 'Draws with you',
    caption: 'A shared Excalidraw canvas with source-anchored comments.',
  },
  {
    file: 'any-running-app.webp',
    title: 'Any running app',
    caption: 'A vite.dev clone with one plugin line.',
    focus: 'object-[82%_center]',
  },
]

const STRIP_GRID =
  'grid grid-cols-1 divide-y border-t lg:grid-cols-4 lg:divide-x lg:divide-y-0 lg:[&>*:last-child]:border-r lg:[&>*:last-child]:border-r-transparent'

function StoryFigure({story}: {story: Story}) {
  const screenshot = findScreenshot(story.file)
  const imageRight = story.imageSide === 'right'
  return (
    <figure className="od-inset grid grid-cols-1 gap-8 border-t py-12 md:grid-cols-12 md:items-center md:gap-12 md:py-16">
      <div className={cn('md:col-span-7', imageRight && 'md:order-2')}>
        <MediaFrame
          src={`/screenshots/${screenshot.file}`}
          width={screenshot.width}
          height={screenshot.height}
          alt={screenshot.alt}
          title={story.title}
        />
      </div>
      <figcaption className={cn('flex flex-col md:col-span-5', imageRight && 'md:order-1')}>
        <h3 className="od-h3">{story.title}</h3>
        <p className="od-body mt-4">{story.caption}</p>
        <ol className="mt-6 flex flex-col gap-2 border-t pt-4">
          {story.facts.map((fact, index) => (
            <li key={fact} className="od-caption grid grid-cols-[20px_minmax(0,1fr)] gap-x-2 text-muted-foreground">
              <span className="od-mono tabular-nums text-accent-text" aria-hidden>
                {index + 1}
              </span>
              {fact}
            </li>
          ))}
        </ol>
      </figcaption>
    </figure>
  )
}

function EvidenceFigure({evidence}: {evidence: Evidence}) {
  const screenshot = findScreenshot(evidence.file)
  return (
    <figure className="flex flex-col gap-4 px-4 py-8 sm:px-6 md:px-8">
      <div className="aspect-[1160/726]">
        <MediaFrame
          src={`/screenshots/${screenshot.file}`}
          width={screenshot.width}
          height={screenshot.height}
          alt={screenshot.alt}
          title={evidence.title}
          fill
          imageClassName={evidence.focus}
        />
      </div>
      <figcaption className="flex flex-col gap-1">
        <h3 className="od-h3">{evidence.title}</h3>
        <p className="od-caption text-muted-foreground">{evidence.caption}</p>
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
          {STORIES.map((story) => (
            <StoryFigure key={story.file} story={story} />
          ))}
          <div className={STRIP_GRID}>
            {EVIDENCE.map((evidence) => (
              <EvidenceFigure key={evidence.file} evidence={evidence} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

import {Link} from '@tanstack/react-router'
import {repoUrl} from '@/lib/shared'
import {formatStarCount} from '@/lib/star-count'
import {useStarCount} from './github-star-link'
import {Reveal} from './reveal'

function LedgerRow({label, value}: {label: string; value: string}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t py-2 first:border-t-0">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
}

export function OpenSourceStrip() {
  const stars = useStarCount()

  return (
    <Reveal>
      <section className="grid grid-cols-1 gap-10 px-8 py-16 md:grid-cols-2">
        <h2 className="od-h2">Open source, on your machine.</h2>
        <div className="od-mono text-[13px]">
          <LedgerRow label="stars" value={stars !== null ? formatStarCount(stars) : '—'} />
          <LedgerRow label="license" value="MIT" />
          <LedgerRow label="conciv-hosted services" value="none" />
          <div className="mt-4 flex flex-col gap-1.5">
            <a href={repoUrl} className="text-primary hover:underline">
              Star on GitHub →
            </a>
            <Link to="/docs/$" params={{_splat: ''}} className="text-primary hover:underline">
              Read the docs →
            </Link>
          </div>
        </div>
      </section>
    </Reveal>
  )
}

import {Link} from '@tanstack/react-router'
import {HeroBackdrop} from './hero-backdrop'
import {InstallCommand} from './install-command'
import {TryLiveButton} from './try-live-button'

export const HERO_HEADLINE = "Your coding agent, inside the app it's building."

export function HeroCopy() {
  return (
    <section className="od-ruled relative">
      <HeroBackdrop />
      <div className="od-page">
        <div className="od-col">
          <div className="od-inset relative flex flex-col items-center py-16 text-center md:py-22">
            <p className="od-eyebrow">Beta · Open source</p>
            <h1 className="od-h1 mt-4 max-w-[720px]">{HERO_HEADLINE}</h1>
            <p className="od-body od-lede mt-4 text-muted-foreground">
              Claude Code or Codex, inside your running app: it sees the page, edits live, writes to source.
            </p>
            <InstallCommand className="mt-8" action={<TryLiveButton />} />
            <p className="od-caption mt-4 text-muted-foreground md:hidden">
              The live try-it flow needs a terminal, so it's desktop-only.{' '}
              <Link
                to="/docs/$"
                params={{_splat: 'quick-start'}}
                className="text-primary underline decoration-1 underline-offset-4"
              >
                Read the quick start →
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

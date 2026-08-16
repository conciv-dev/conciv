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
          <div className="od-inset relative flex flex-col items-center pt-16 pb-12 text-center md:pt-24">
            <p className="od-eyebrow">Beta · Open source · MIT · dev-only</p>
            <h1 className="od-h1 mt-4 max-w-[720px]">{HERO_HEADLINE}</h1>
            <p className="od-body mt-4 max-w-[512px] text-muted-foreground">
              conciv connects Claude Code or Codex to your running dev app. It sees the real DOM, edits the page live,
              writes the change to source, and runs your tests — without you leaving the page.
            </p>
            <InstallCommand className="mt-8" action={<TryLiveButton />} />
          </div>
        </div>
      </div>
    </section>
  )
}

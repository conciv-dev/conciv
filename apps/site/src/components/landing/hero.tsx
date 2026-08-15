import {InstallCommand} from './install-command'
import {TryLiveButton} from './try-live-button'

export const HERO_HEADLINE = "Your coding agent, inside the app it's building."

export function HeroCopy() {
  return (
    <div className="mx-auto max-w-[720px] px-8 pb-10 pt-10 text-center md:pt-[72px]">
      <p className="od-eyebrow mb-5">Beta · Open source · MIT · dev-only</p>
      <h1 className="od-h1 mb-5">{HERO_HEADLINE}</h1>
      <p className="mx-auto mb-8 max-w-[52ch] text-[18px] text-muted-foreground">
        conciv connects Claude Code or Codex to your running dev app. It sees the real DOM, edits the page live, writes
        the change to source, and runs your tests — without you leaving the page.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <InstallCommand />
        <TryLiveButton />
      </div>
    </div>
  )
}

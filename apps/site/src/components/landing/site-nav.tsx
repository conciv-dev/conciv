import {ThemeToggle} from './theme-toggle'

// Flip to true once the repo is public to surface the GitHub link.
const SHOW_GITHUB = false

export function SiteNav() {
  return (
    <nav className="mx-auto flex max-w-[1180px] items-center gap-7 px-8 py-[22px]">
      <div className="od-display mr-auto flex items-center gap-2 text-[19px] font-bold">
        <span className="text-primary">✦</span> conciv
      </div>
      <a href="#how" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        How it works
      </a>
      {SHOW_GITHUB ? (
        <a
          href="https://github.com/conciv-dev/conciv"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          GitHub
        </a>
      ) : null}
      <ThemeToggle />
    </nav>
  )
}

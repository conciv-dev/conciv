import {ThemeToggle} from './theme-toggle'

export function SiteNav() {
  return (
    <nav className="mx-auto flex max-w-[1180px] items-center gap-7 px-8 py-[22px]">
      <div className="od-display mr-auto flex items-center gap-2 text-[19px] font-bold">
        <span className="text-primary">✦</span> conciv
      </div>
      <a href="#how" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        How it works
      </a>
      <a href="/docs" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        Docs
      </a>
      <a
        href="https://github.com/conciv-dev/conciv"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        GitHub
      </a>
      <ThemeToggle />
    </nav>
  )
}

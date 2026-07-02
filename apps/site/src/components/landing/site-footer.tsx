const PRODUCT = [
  {label: 'Docs', href: '/docs'},
  {label: 'Quick start', href: '/docs/quick-start'},
  {label: 'Configuration', href: '/docs/configuration'},
  {label: 'Troubleshooting', href: '/docs/troubleshooting'},
]

const COMMUNITY = [
  {label: 'GitHub', href: 'https://github.com/conciv-dev/conciv'},
  {label: 'Issues', href: 'https://github.com/conciv-dev/conciv/issues'},
  {label: 'Releases', href: 'https://github.com/conciv-dev/conciv/releases'},
]

const INSTALL = [
  {label: 'npm — @conciv/it', href: 'https://www.npmjs.com/package/@conciv/it'},
  {label: 'Example app', href: 'https://github.com/conciv-dev/conciv/tree/main/apps/examples/tanstack-start'},
]

function Column({title, links}: {title: string; links: {label: string; href: string}[]}) {
  return (
    <div>
      <h5 className="mb-3.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[oklch(0.68_0.012_70)]">
        {title}
      </h5>
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          className="mb-2.5 block text-[13.5px] text-[oklch(0.85_0.008_75)] transition-colors hover:text-white"
        >
          {link.label}
        </a>
      ))}
    </div>
  )
}

export function SiteFooter() {
  return (
    <footer className="od-footer relative overflow-hidden">
      <iframe
        src="/radiant/ink-dissolve.html"
        title=""
        aria-hidden
        loading="lazy"
        tabIndex={-1}
        className="od-footer-shader pointer-events-none absolute inset-0 size-full border-0 opacity-25 [mask-image:linear-gradient(200deg,transparent_35%,#000_78%)]"
      />
      <div className="relative mx-auto grid max-w-[1180px] gap-10 px-8 pb-10 pt-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="od-display flex items-center gap-2 text-[19px] font-bold text-[oklch(0.94_0.006_75)]">
            <span className="text-[oklch(0.7_0.19_32)]">✦</span> conciv
          </div>
          <p className="mt-2.5 max-w-[30ch] text-[13px] text-[oklch(0.68_0.012_70)]">
            An AI dev agent that lives inside your running app. Dev-only, open source, harness-agnostic.
          </p>
        </div>
        <Column title="Product" links={PRODUCT} />
        <Column title="Community" links={COMMUNITY} />
        <Column title="Install" links={INSTALL} />
      </div>
      <div className="relative border-t border-[oklch(0.31_0.01_65)]">
        <div className="mx-auto flex max-w-[1180px] justify-between px-8 py-[18px] font-mono text-[11.5px] font-medium text-[oklch(0.68_0.012_70)]">
          <span>MIT © conciv</span>
          <span className="text-[oklch(0.7_0.19_32)]">beta</span>
        </div>
      </div>
    </footer>
  )
}

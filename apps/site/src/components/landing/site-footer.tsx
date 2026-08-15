import {Link} from '@tanstack/react-router'
import {SparkMark} from './spark-mark'
import {GitHubStarLink} from './github-star-link'
import {repoUrl} from '@/lib/shared'

const PRODUCT = [
  {label: 'Docs', splat: ''},
  {label: 'Quick start', splat: 'quick-start'},
  {label: 'Configuration', splat: 'configuration'},
  {label: 'Troubleshooting', splat: 'troubleshooting'},
]

const COMMUNITY = [
  {label: 'Issues', href: `${repoUrl}/issues`},
  {label: 'Releases', href: `${repoUrl}/releases`},
]

const INSTALL = [
  {label: 'npm: @conciv/it', href: 'https://www.npmjs.com/package/@conciv/it'},
  {label: 'Example app', href: `${repoUrl}/tree/main/apps/examples/tanstack-start`},
]

const LINK_CLASS = 'mb-2.5 block text-[13.5px] text-[oklch(0.85_0.008_75)] transition-colors hover:text-white'

function ColumnHeading({title}: {title: string}) {
  return (
    <p className="mb-3.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[oklch(0.68_0.012_70)]">
      {title}
    </p>
  )
}

function DocsColumn() {
  return (
    <div>
      <ColumnHeading title="Product" />
      {PRODUCT.map((link) => (
        <Link key={link.label} to="/docs/$" params={{_splat: link.splat}} className={LINK_CLASS}>
          {link.label}
        </Link>
      ))}
    </div>
  )
}

function Column({title, links}: {title: string; links: {label: string; href: string}[]}) {
  return (
    <div>
      <ColumnHeading title={title} />
      {links.map((link) => (
        <a key={link.label} href={link.href} className={LINK_CLASS}>
          {link.label}
        </a>
      ))}
    </div>
  )
}

function CommunityColumn() {
  return (
    <div>
      <ColumnHeading title="Community" />
      <GitHubStarLink className={LINK_CLASS} />
      {COMMUNITY.map((link) => (
        <a key={link.label} href={link.href} className={LINK_CLASS}>
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
        tabIndex={-1}
        sandbox="allow-scripts"
        className="od-footer-shader pointer-events-none absolute inset-0 size-full border-0 opacity-25 [mask-image:linear-gradient(200deg,transparent_35%,#000_78%)]"
      />
      <div className="relative mx-auto grid max-w-[1180px] gap-10 px-8 pb-10 pt-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="od-display flex items-center gap-2 text-[19px] font-bold text-[oklch(0.94_0.006_75)]">
            <SparkMark className="text-[oklch(0.7_0.19_32)]" /> conciv
          </div>
          <p className="mt-2.5 max-w-[30ch] text-[13px] text-[oklch(0.68_0.012_70)]">
            An AI dev agent that lives inside your running app. Dev-only, open source, harness-agnostic.
          </p>
        </div>
        <DocsColumn />
        <CommunityColumn />
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

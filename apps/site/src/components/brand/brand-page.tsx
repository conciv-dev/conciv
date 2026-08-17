import type {ReactNode} from 'react'
import {SiteNav} from '@/components/landing/site-nav'
import {SiteFooter} from '@/components/landing/site-footer'
import {SmoothScroll} from '@/components/landing/smooth-scroll'
import {BRAND_COLOURS, faviconIcons, fileLabel, socialAssets, type BrandFile} from '@/lib/brand-assets'
import {BrandBackdrop, BrandImage} from './brand-preview'
import {DownloadButton} from './brand-actions'
import {LogoPicker} from './logo-picker'

const USAGE = [
  {
    rule: 'Crimson is the primary mark',
    detail: `${BRAND_COLOURS.crimson} by default. Single-colour cuts are for monochrome contexts only: print, engraving, one-colour UI.`,
  },
  {
    rule: 'The wordmark inherits text colour',
    detail: 'Its paths are filled with currentColor, so it picks up the surrounding text colour.',
  },
  {rule: 'Never redraw it', detail: 'No outlines, shadows, stretching, or rebuilt letterforms.'},
  {rule: 'The wordmark ships outlined', detail: 'Geist SemiBold, converted to paths. No font to install.'},
  {rule: 'Clear space', detail: 'Keep one antenna-height of empty space on every side.'},
  {rule: 'Below 24px, use the favicon cut', detail: 'The fused-ear mark holds up where the full mark closes in.'},
]

const PALETTE = [
  {name: 'Crimson', value: BRAND_COLOURS.crimson},
  {name: 'Deep', value: BRAND_COLOURS.deep},
  {name: 'Charcoal', value: BRAND_COLOURS.charcoal},
  {name: 'Cream', value: BRAND_COLOURS.cream},
  {name: 'White', value: BRAND_COLOURS.white},
]

function Section({id, title, blurb, children}: {id: string; title: string; blurb: string; children: ReactNode}) {
  return (
    <section id={id} className="border-t py-14">
      <h2 className="od-display text-[clamp(22px,2.4vw,30px)] font-bold tracking-[-0.025em]">{title}</h2>
      <p className="max-w-[62ch] pt-1.5 pb-8 text-[14px] text-muted-foreground">{blurb}</p>
      {children}
    </section>
  )
}

function AssetCard({file, previewClassName}: {file: BrandFile; previewClassName: string}) {
  const label = fileLabel(file.path)
  const format = file.format.toUpperCase()
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <BrandBackdrop tone={file.tone} className="h-32 overflow-hidden p-5">
        <BrandImage path={file.path} alt={`conciv ${label.toLowerCase()}`} className={previewClassName} />
      </BrandBackdrop>
      <div className="flex-1">
        <p className="text-[13.5px] font-semibold">{label}</p>
        <p className="font-mono text-[11.5px] text-muted-foreground">{`${format} · ${file.size}`}</p>
      </div>
      <DownloadButton
        path={file.path}
        label="Download"
        accessibleName={`Download ${label.toLowerCase()}, ${format} ${file.size}`}
      />
    </div>
  )
}

function FaviconGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {faviconIcons().map((file) => (
        <AssetCard key={file.path} file={file} previewClassName="max-h-16 max-w-16" />
      ))}
    </div>
  )
}

function SocialGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {socialAssets().map((file) => (
        <AssetCard key={file.path} file={file} previewClassName="h-20 max-w-full" />
      ))}
    </div>
  )
}

function Palette() {
  return (
    <div className="flex flex-wrap gap-3">
      {PALETTE.map((colour) => (
        <div key={colour.name} className="w-36 overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <div className="h-16" style={{backgroundColor: colour.value}} />
          <div className="px-3 py-2">
            <p className="text-[13px] font-semibold">{colour.name}</p>
            <p className="font-mono text-[11.5px] uppercase text-muted-foreground">{colour.value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function Usage() {
  return (
    <ul className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
      {USAGE.map((line) => (
        <li key={line.rule}>
          <p className="text-[14px] font-semibold">{line.rule}</p>
          <p className="text-[13.5px] text-muted-foreground">{line.detail}</p>
        </li>
      ))}
    </ul>
  )
}

export function BrandPage() {
  return (
    <SmoothScroll>
      <div className="od-page min-h-screen">
        <SiteNav />
        <main className="mx-auto max-w-[1180px] px-8 pb-16">
          <header className="pt-10 pb-14">
            <p className="pb-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Brand</p>
            <h1 className="od-display max-w-[18ch] text-[clamp(32px,4.4vw,52px)] font-bold leading-[1.03] tracking-[-0.03em]">
              The conciv logo, in every cut you need
            </h1>
            <p className="max-w-[58ch] pt-4 text-[15px] text-muted-foreground">
              A crimson chat-bubble robot and an outlined Geist SemiBold wordmark. Pick a layout, pick a tone, copy the
              SVG or download the file.
            </p>
          </header>
          <Section id="logo" title="Logo" blurb="Every lockup, in SVG and PNG, on the backdrop it was drawn for.">
            <LogoPicker />
          </Section>
          <Section
            id="favicon"
            title="Favicon and app icons"
            blurb="The fused-ear cut that survives 16 pixels, plus the rounded tiles browsers and phones ask for."
          >
            <FaviconGrid />
          </Section>
          <Section id="social" title="Social" blurb="Avatars, link previews, and the README banner.">
            <SocialGrid />
          </Section>
          <Section id="colour" title="Colour" blurb="Crimson carries the mark. Everything else is supporting cast.">
            <Palette />
          </Section>
          <Section id="usage" title="Usage" blurb="Six rules that keep the mark recognisable everywhere it lands.">
            <Usage />
          </Section>
        </main>
        <SiteFooter />
      </div>
    </SmoothScroll>
  )
}

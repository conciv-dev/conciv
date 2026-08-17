import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {
  downloadFiles,
  humanLabel,
  LOGO_FORMATS,
  LOGO_LAYOUTS,
  logoTones,
  previewFile,
  resolveTone,
  type LogoFormat,
  type LogoLayout,
} from '@/lib/brand-assets'
import {BrandBackdrop, BrandImage} from './brand-preview'
import {CopySvgButton, DownloadButton} from './brand-actions'

const PREVIEW_HEIGHT: Record<LogoLayout, string> = {
  mark: 'h-24 w-24',
  landscape: 'h-14 w-auto',
  stacked: 'h-24 w-auto',
  wordmark: 'h-10 w-auto',
}

function OptionGroup<Value extends string>({
  legend,
  options,
  selected,
  onSelect,
}: {
  legend: string
  options: ReadonlyArray<Value>
  selected: Value
  onSelect: (value: Value) => void
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="pb-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {legend}
      </legend>
      {options.map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={option === selected ? 'default' : 'outline'}
          aria-pressed={option === selected}
          onClick={() => onSelect(option)}
        >
          {humanLabel(option)}
        </Button>
      ))}
    </fieldset>
  )
}

export function LogoPicker() {
  const [layout, setLayout] = useState<LogoLayout>('landscape')
  const [format, setFormat] = useState<LogoFormat>('svg')
  const [requestedTone, setRequestedTone] = useState('crimson-on-light')

  const tone = resolveTone(layout, format, requestedTone)
  const tones = logoTones(layout, format)
  const preview = previewFile(layout, tone)
  const downloads = downloadFiles(layout, format, tone)
  const description = `${humanLabel(layout)} logo, ${humanLabel(tone)}`

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <BrandBackdrop tone={tone} className="min-h-[260px]">
        {preview ? (
          <BrandImage
            path={preview.path}
            alt={`conciv ${humanLabel(layout)} logo, ${humanLabel(tone)}`}
            className={PREVIEW_HEIGHT[layout]}
          />
        ) : null}
      </BrandBackdrop>
      <div className="flex flex-col gap-5">
        <OptionGroup legend="Layout" options={LOGO_LAYOUTS} selected={layout} onSelect={setLayout} />
        <OptionGroup legend="Format" options={LOGO_FORMATS} selected={format} onSelect={setFormat} />
        <OptionGroup legend="Tone" options={tones} selected={tone} onSelect={setRequestedTone} />
        <div className="flex flex-wrap gap-2 border-t pt-5">
          {format === 'svg' && preview ? <CopySvgButton key={preview.path} path={preview.path} /> : null}
          {downloads.map((file) => (
            <DownloadButton
              key={file.path}
              path={file.path}
              label={format === 'svg' ? 'Download SVG' : `PNG ${file.size}`}
              accessibleName={
                format === 'svg' ? `Download ${description}, SVG` : `Download ${description}, PNG ${file.size}`
              }
            />
          ))}
        </div>
      </div>
    </div>
  )
}

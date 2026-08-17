import {useEffect, useRef, useState} from 'react'
import {Check, Copy, Download, TriangleAlert} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {brandAssetUrl} from '@/lib/brand-assets'

const RESET_DELAY = 1400

type CopyState = 'idle' | 'copied' | 'failed'

const COPY_ICON: Record<CopyState, typeof Copy> = {
  idle: Copy,
  copied: Check,
  failed: TriangleAlert,
}

const COPY_LABEL: Record<CopyState, string> = {
  idle: 'Copy SVG',
  copied: 'Copied',
  failed: 'Copy failed',
}

export function CopySvgButton({path}: {path: string}) {
  const [state, setState] = useState<CopyState>('idle')
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    setState('idle')
    clearTimeout(resetTimer.current)
    return () => clearTimeout(resetTimer.current)
  }, [path])

  const copy = async () => {
    clearTimeout(resetTimer.current)
    try {
      const response = await fetch(brandAssetUrl(path))
      if (!response.ok) throw new Error(`Failed to fetch ${path}`)
      await navigator.clipboard.writeText(await response.text())
      setState('copied')
    } catch {
      setState('failed')
    }
    resetTimer.current = setTimeout(() => setState('idle'), RESET_DELAY)
  }

  const Icon = COPY_ICON[state]

  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => void copy()}>
      <Icon data-icon="inline-start" />
      {COPY_LABEL[state]}
    </Button>
  )
}

export function DownloadButton({path, label}: {path: string; label: string}) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={brandAssetUrl(path)} download>
        <Download data-icon="inline-start" />
        {label}
      </a>
    </Button>
  )
}

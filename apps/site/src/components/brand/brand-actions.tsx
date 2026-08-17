import {useEffect} from 'react'
import {useMutation, type MutationStatus} from '@tanstack/react-query'
import {Check, Copy, Download, TriangleAlert} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {brandAssetUrl} from '@/lib/brand-assets'

const RESET_DELAY = 1400

const COPY_ICON: Record<MutationStatus, typeof Copy> = {
  idle: Copy,
  pending: Copy,
  success: Check,
  error: TriangleAlert,
}

const COPY_LABEL: Record<MutationStatus, string> = {
  idle: 'Copy SVG',
  pending: 'Copy SVG',
  success: 'Copied',
  error: 'Copy failed',
}

async function copySvgSource(path: string) {
  const response = await fetch(brandAssetUrl(path))
  if (!response.ok) return Promise.reject(response.status)
  await navigator.clipboard.writeText(await response.text())
}

export function CopySvgButton({path}: {path: string}) {
  const {mutate, reset, status} = useMutation({mutationFn: copySvgSource})

  useEffect(() => {
    if (status === 'idle' || status === 'pending') return
    const revertTimer = setTimeout(reset, RESET_DELAY)
    return () => clearTimeout(revertTimer)
  }, [status, reset])

  const Icon = COPY_ICON[status]

  return (
    <Button type="button" variant="secondary" size="sm" disabled={status === 'pending'} onClick={() => mutate(path)}>
      <Icon data-icon="inline-start" />
      {COPY_LABEL[status]}
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

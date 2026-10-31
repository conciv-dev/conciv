import {splitProps, type JSX} from 'solid-js'
import {ZoomableImage} from '@conciv/ui-kit-system'
import {useViewportInternal} from '../../primitives/thread/viewport-internal.js'

export function ResultImage(props: {src: string; alt: string}): JSX.Element {
  const [local] = splitProps(props, ['src', 'alt'])
  const viewport = useViewportInternal()
  const portal = (): HTMLElement | undefined => {
    const element = viewport?.element()
    return element?.closest<HTMLElement>('[data-conciv-panel]')?.parentElement ?? element
  }
  return <ZoomableImage src={local.src} alt={local.alt} portal={portal()} />
}

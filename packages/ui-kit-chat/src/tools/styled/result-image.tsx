import {splitProps, type JSX} from 'solid-js'
import {ZoomableImage} from '@conciv/ui-kit-system'

export function ResultImage(props: {src: string; alt: string}): JSX.Element {
  const [local, rest] = splitProps(props, ['src', 'alt'])
  return <ZoomableImage {...rest} src={local.src} alt={local.alt} />
}

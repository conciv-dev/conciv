import {createEffect, onCleanup, Show, splitProps, type ComponentProps, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {AppIconName} from '@conciv/frontend-plugin-api'
import {isDocument, isShadowRoot} from '@conciv/ui-kit-system'
import {getIcon, isIconName} from './catalog.js'
import {isRegisteredIconName, mountRegisteredIcon, registeredIconSymbol, type RegisteredIconName} from './registry.js'

export interface IconProps extends ComponentProps<'svg'> {
  name: AppIconName | RegisteredIconName | (string & {})
  size?: 'small' | 'normal' | 'large'
}

export function Icon(props: IconProps): JSX.Element {
  const [split, rest] = splitProps(props, ['name', 'size'])
  const element: {svg?: SVGSVGElement} = {}

  const registered = () => (isRegisteredIconName(split.name) ? split.name : undefined)
  const iconName = (): AppIconName => (isIconName(split.name) ? split.name : 'plus')

  const pixelSize = () => (split.size === 'large' ? 20 : split.size === 'small' ? 14 : 16)

  createEffect(() => {
    const name = registered()
    const root = element.svg?.getRootNode()

    if (name && (isDocument(root) || isShadowRoot(root))) onCleanup(mountRegisteredIcon(name, root))
  })

  return (
    <Show
      when={registered()}
      fallback={
        <Dynamic
          component={getIcon(iconName())}
          {...rest}
          size={pixelSize()}
          aria-hidden={rest['aria-hidden'] ?? 'true'}
        />
      }
    >
      {(name) => (
        <svg
          {...rest}
          ref={(svg) => (element.svg = svg)}
          width={pixelSize()}
          height={pixelSize()}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden={rest['aria-hidden'] ?? 'true'}
        >
          <use href={`#${registeredIconSymbol(name())}`} />
        </svg>
      )}
    </Show>
  )
}

import {createEffect, onCleanup, Show, splitProps, type ComponentProps, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {AppIconName} from '@conciv/frontend-plugin-api'
import {isDocument, isShadowRoot} from '@conciv/ui-kit-system'
import {getIcon, isIconName} from './catalog.js'
import {isRegisteredIconName, type RegisteredIconName} from './registry.js'
import {useIconRegistry} from './icon-registry-provider.js'

export interface IconProps extends ComponentProps<'svg'> {
  name: AppIconName | RegisteredIconName | (string & {})
  size?: 'small' | 'normal' | 'large'
}

export function Icon(props: IconProps): JSX.Element {
  const [split, rest] = splitProps(props, ['name', 'size'])
  const registered = () => (isRegisteredIconName(split.name) ? split.name : undefined)
  const iconName = (): AppIconName => (isIconName(split.name) ? split.name : 'plus')

  const pixelSize = () => (split.size === 'large' ? 20 : split.size === 'small' ? 14 : 16)

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
      {(name) => <RegisteredIcon {...rest} name={name()} pixelSize={pixelSize()} />}
    </Show>
  )
}

function RegisteredIcon(
  props: ComponentProps<'svg'> & {readonly name: RegisteredIconName; readonly pixelSize: number},
): JSX.Element {
  const [split, rest] = splitProps(props, ['name', 'pixelSize'])
  const registry = useIconRegistry()
  const element: {svg?: SVGSVGElement} = {}

  createEffect(() => {
    const name = split.name
    const root = element.svg?.getRootNode()

    if (isDocument(root) || isShadowRoot(root)) onCleanup(registry.mountRegisteredIcon(name, root))
  })

  return (
    <svg
      {...rest}
      ref={(svg) => (element.svg = svg)}
      width={split.pixelSize}
      height={split.pixelSize}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={rest['aria-hidden'] ?? 'true'}
    >
      <use href={`#${registry.registeredIconSymbol(split.name)}`} />
    </svg>
  )
}

import {createEffect} from 'solid-js'
import {createThrottledValue} from '@tanstack/solid-pacer'

const RENDER_INTERVAL_MS = 100

type RenderTarget<Options, Payload> = {
  setOptions: (options: Options) => void
  render: (input: Payload & {forceRender: boolean}) => unknown
}

export function syncRender<Options, Payload>(source: {
  target: () => RenderTarget<Options, Payload> | null
  payload: () => Payload
  options: () => Options | undefined
}): void {
  let primed = false
  let renderedOptions: Options | undefined
  const [pacedPayload] = createThrottledValue(source.payload, {
    wait: RENDER_INTERVAL_MS,
    leading: true,
    trailing: true,
  })

  createEffect(() => {
    const payload = pacedPayload()
    const options = source.options()
    const target = source.target()
    if (!target) return
    if (!primed) {
      primed = true
      renderedOptions = options
      return
    }
    const optionsChanged = options !== renderedOptions
    renderedOptions = options
    if (options) target.setOptions(options)
    void target.render({...payload, forceRender: optionsChanged})
  })
}

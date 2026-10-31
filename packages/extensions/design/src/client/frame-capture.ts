import {snapdom} from '@zumer/snapdom'
import {z} from 'zod'
import {toolError} from '@conciv/extension'
import {keepBodyMargins} from '@conciv/extension-page/body-margins'
import {DESIGN_ERRORS} from '../shared/defs.js'
import {TOLERANCES} from '../shared/tolerances.js'

const CAPTURE_REQUEST = 'conciv-design:capture'

const captureRequest = z.object({type: z.literal(CAPTURE_REQUEST)})
const captureReply = z.union([z.object({blob: z.instanceof(Blob)}), z.object({error: z.string()})])

function insideCaptureFrame(): boolean {
  try {
    return window.frameElement?.hasAttribute('data-conciv-capture') === true
  } catch {
    return false
  }
}

async function answer(port: MessagePort): Promise<void> {
  try {
    const capture = await snapdom(document.documentElement, {dpr: 1, embedFonts: true, plugins: [keepBodyMargins]})
    port.postMessage({blob: await capture.toBlob({format: 'png'})})
  } catch (error) {
    port.postMessage({error: error instanceof Error ? error.message : String(error)})
  } finally {
    port.close()
  }
}

export function answerCaptureRequests(): void {
  if (typeof window === 'undefined' || !insideCaptureFrame()) return
  window.addEventListener('message', (event) => {
    const port = event.ports[0]
    if (event.source !== window.parent || port === undefined) return
    if (!captureRequest.safeParse(event.data).success) return
    void answer(port)
  })
}

export function requestFrameCapture(frame: HTMLIFrameElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const target = frame.contentWindow
    if (target === null) return reject(new Error('The capture frame has no window.'))
    const channel = new MessageChannel()
    const signal = AbortSignal.timeout(TOLERANCES.frameSettleMs)
    signal.addEventListener('abort', () => {
      channel.port1.close()
      reject(toolError('frame-timeout', {message: DESIGN_ERRORS['frame-timeout'].message}))
    })
    channel.port1.addEventListener('message', (event) => {
      channel.port1.close()
      const reply = captureReply.safeParse(event.data)
      if (!reply.success) return reject(new Error('The capture frame sent an unreadable reply.'))
      if ('error' in reply.data) return reject(new Error(reply.data.error))
      resolve(reply.data.blob)
    })
    channel.port1.start()
    target.postMessage({type: CAPTURE_REQUEST}, location.origin, [channel.port2])
  })
}

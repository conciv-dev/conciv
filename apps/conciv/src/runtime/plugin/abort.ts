const reason = new DOMException('signal is aborted without reason', 'AbortError')

export function abort(controller: AbortController | undefined) {
  controller?.abort(reason)
}

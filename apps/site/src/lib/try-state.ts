export function shouldAutoOpen(opts: {
  widgetOpen: boolean
  tryParam: boolean
  dismissed: boolean
  widgetPresent: boolean
}): boolean {
  return !opts.widgetPresent && !opts.tryParam && !opts.dismissed && opts.widgetOpen
}

export function readPanelToggle(opts: {
  wasOpen: boolean
  open: boolean
  connected: boolean
}): 'none' | 'close' | 'dismiss' {
  if (!opts.wasOpen || opts.open) return 'none'
  return opts.connected ? 'close' : 'dismiss'
}

export function tryButtonLabel(opts: {connected: boolean; pending: boolean}): string {
  if (opts.connected) return 'Open agent panel'
  if (opts.pending) return 'Opening…'
  return 'Try it live'
}

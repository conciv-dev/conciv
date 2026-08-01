export function shouldAutoOpen(opts: {
  widgetOpen: boolean
  tryParam: boolean
  dismissed: boolean
  widgetPresent: boolean
}): boolean {
  return !opts.widgetPresent && !opts.tryParam && !opts.dismissed && opts.widgetOpen
}

export function shouldDismissOnClose(opts: {hasBeenOpen: boolean; connected: boolean}): boolean {
  return opts.hasBeenOpen && !opts.connected
}

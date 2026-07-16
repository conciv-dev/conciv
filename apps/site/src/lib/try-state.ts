export function shouldAutoOpen(opts: {tryParam: boolean; dismissed: boolean; widgetPresent: boolean}): boolean {
  return !opts.widgetPresent && !opts.tryParam && !opts.dismissed
}

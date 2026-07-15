export const TRY_DISMISSED_KEY = 'conciv-try-dismissed'

export function shouldAutoOpen(opts: {tryParam: boolean; dismissed: boolean; widgetPresent: boolean}): boolean {
  return !opts.widgetPresent && !opts.tryParam && !opts.dismissed
}

import type {InitOutput} from './wizard.js'

export function silentOutput(): InitOutput {
  const quiet = () => {}
  return {
    intro: quiet,
    spinner: () => ({stop: quiet, fail: quiet}),
    plan: quiet,
    step: () => ({line: quiet, settle: quiet}),
    note: quiet,
    line: quiet,
    success: quiet,
    warn: quiet,
    error: quiet,
    cancelled: quiet,
    outro: quiet,
    failure: quiet,
  }
}

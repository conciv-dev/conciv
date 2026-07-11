import type {DebugConfig, Logger} from '@tanstack/ai'

const writeErr = (message: string): void => void process.stderr.write(`${message}\n`)

export const logError = (message: string): void => writeErr(message)

const harnessLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: writeErr,
  error: writeErr,
}

export const harnessDebug: DebugConfig = {
  logger: harnessLogger,
  provider: false,
  output: false,
  middleware: false,
  tools: false,
  agentLoop: false,
  config: false,
  request: false,
}

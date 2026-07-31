import type {TerminalOpener, TerminalOpenRequest} from '@conciv/protocol/harness-types'

export type RecordingTerminalOpener = {open: TerminalOpener; opened: TerminalOpenRequest[]}

export function createRecordingTerminalOpener(): RecordingTerminalOpener {
  const opened: TerminalOpenRequest[] = []
  return {
    opened,
    open: (request) => {
      opened.push({bin: request.bin, args: [...request.args]})
      return Promise.resolve(true)
    },
  }
}

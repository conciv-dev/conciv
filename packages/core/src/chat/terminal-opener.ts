import {spawn} from 'node:child_process'
import type {TerminalOpener} from '@conciv/protocol/harness-types'

export const spawnTerminalOpener: TerminalOpener = ({bin, args}) =>
  new Promise((settle) => {
    const child = spawn(bin, args, {detached: true, stdio: 'ignore'})
    child.once('spawn', () => {
      child.unref()
      settle(true)
    })
    child.once('error', () => settle(false))
  })

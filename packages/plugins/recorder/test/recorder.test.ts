import {fileURLToPath} from 'node:url'
import {describe, expect, it, onTestFinished} from 'vitest'
import {bootCoreKit, type CoreKit} from '@conciv/plugin-testkit/core-kit'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))

async function bootRecorder(): Promise<CoreKit> {
  const kit = await bootCoreKit({id: 'fake', plugins: [PACKAGE_DIR]})
  onTestFinished(() => kit.cleanup())
  return kit
}

describe('the recorder plugin in a real engine', () => {
  it('is active', async () => {
    const kit = await bootRecorder()
    const plugin = (await kit.rpc.plugin.list()).data.find((entry) => entry.id === 'recorder')
    expect(plugin?.state).toEqual({status: 'active'})
  })
})

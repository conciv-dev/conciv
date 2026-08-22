import {describe, it} from 'vitest'
import {expect as expectLocator} from 'playwright/test'
import {makeExtRpcClient} from '@conciv/extension'
import {type RecorderRouter} from '../src/server.js'
import {RECORDER_MIME, RECORDER_NAME, recordingRefJson} from '../src/shared/protocol.js'
import {useRecorderTestApi} from './helpers/test-api.js'
import {addMarker, startLiveCapture} from './helpers/fixtures.js'

const api = useRecorderTestApi()

async function attachThroughForm(name: string, text: string): Promise<void> {
  const page = api().page
  await page.getByRole('textbox', {name: 'Attachment name'}).fill(name)
  await page.getByRole('textbox', {name: 'Attachment type'}).fill(RECORDER_MIME)
  await page.getByRole('textbox', {name: 'Attachment text'}).fill(text)
  await page.getByRole('button', {name: 'Attach fixture file'}).click()
}

describe('recording card in the testkit host (real chips, real store)', () => {
  it('renders the real chip with poster + Play, plays over a real fetch, and shows expired for a dead id', async () => {
    await startLiveCapture(api())
    await addMarker(api().page)
    await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0})

    const rpc = makeExtRpcClient<RecorderRouter>(api().apiBase, RECORDER_NAME)
    const {clients} = await rpc.clients()
    const clientId = clients.at(-1)?.id
    if (!clientId) throw new Error('no recorder client connected')
    const saved = await rpc.recordings.save({clientId})
    if (!('recordingId' in saved)) throw new Error(`expected recordingId, got ${JSON.stringify(saved)}`)

    await attachThroughForm(
      'live-rec',
      recordingRefJson({recordingId: saved.recordingId, poster: 'Screen recording · live-poster'}),
    )
    await api().page.getByText('Screen recording · live-poster').waitFor({state: 'visible', timeout: 15_000})
    const play = api().page.getByRole('button', {name: 'Play', exact: true})
    await play.waitFor({state: 'visible', timeout: 15_000})
    await play.click()
    const modal = api().page.getByRole('dialog', {name: 'Screen recording replay'})
    await modal.waitFor({state: 'visible', timeout: 15_000})
    await expectLocator(
      api().page.frameLocator('iframe').getByText('Comment target', {exact: true}).first(),
    ).toBeAttached({timeout: 15_000})
    await modal.getByRole('button', {name: 'Close'}).click()
    await modal.waitFor({state: 'hidden', timeout: 15_000})

    await attachThroughForm(
      'dead-rec',
      recordingRefJson({recordingId: 'gone-recording', poster: 'Screen recording · dead-poster'}),
    )
    await api().page.getByText('Screen recording · dead-poster').waitFor({state: 'visible', timeout: 15_000})
    const deadPlay = api().page.getByRole('button', {name: 'Play', exact: true}).last()
    await deadPlay.waitFor({state: 'visible', timeout: 15_000})
    await deadPlay.click()
    await api()
      .page.getByRole('dialog', {name: 'Screen recording replay'})
      .getByText('Recording expired.')
      .waitFor({state: 'visible', timeout: 15_000})
  }, 120_000)
})

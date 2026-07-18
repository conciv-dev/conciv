import {describe, expect, it} from 'vitest'
import {makeExtRpcClient} from '@conciv/extension'
import {type RecorderRouter} from '../src/server.js'
import {RECORDER_MIME, RECORDER_NAME, recordingRefJson} from '../src/shared/protocol.js'
import {useRecorderTestApi} from './helpers/test-api.js'

const api = useRecorderTestApi()

function attachInPage(name: string, text: string): Promise<void> {
  return api().page.evaluate(
    ({name: fileName, text: fileText, mime}) => {
      document.dispatchEvent(new CustomEvent('testkit:attach', {detail: {name: fileName, type: mime, text: fileText}}))
    },
    {name, text, mime: RECORDER_MIME},
  )
}

describe('recording card in the testkit host (real chips, real store)', () => {
  it('renders the real chip with poster + Play, plays over a real fetch, and shows expired for a dead id', async () => {
    await api().page.evaluate(() => {
      const button = document.createElement('button')
      button.textContent = 'Card fixture'
      button.id = 'card-fixture'
      document.body.appendChild(button)
    })
    await api().page.click('#card-fixture')
    await api().callTool('recording_pull', {secondsBack: 120, keyframes: 0})

    const rpc = makeExtRpcClient<RecorderRouter>(api().apiBase, RECORDER_NAME)
    const saved = await rpc.recordings.save({})
    if (!('recordingId' in saved)) throw new Error(`expected recordingId, got ${JSON.stringify(saved)}`)

    await attachInPage(
      'live-rec',
      recordingRefJson({recordingId: saved.recordingId, poster: 'Screen recording · live-poster'}),
    )
    await api().page.getByText('Screen recording · live-poster').waitFor({state: 'visible', timeout: 15_000})
    const play = api().page.getByRole('button', {name: 'Play'})
    await play.waitFor({state: 'visible', timeout: 15_000})
    await play.click()
    const modal = api().page.getByRole('alertdialog', {name: 'Screen recording replay'})
    await modal.waitFor({state: 'visible', timeout: 15_000})
    await expect
      .poll(() => api().page.evaluate(() => Boolean(document.querySelector('.rr-player iframe'))), {timeout: 15_000})
      .toBe(true)
    await modal.getByRole('button', {name: 'Close'}).click()
    await modal.waitFor({state: 'hidden', timeout: 15_000})

    await attachInPage(
      'dead-rec',
      recordingRefJson({recordingId: 'gone-recording', poster: 'Screen recording · dead-poster'}),
    )
    await api().page.getByText('Screen recording · dead-poster').waitFor({state: 'visible', timeout: 15_000})
    const deadPlay = api().page.getByRole('button', {name: 'Play'}).last()
    await deadPlay.waitFor({state: 'visible', timeout: 15_000})
    await deadPlay.click()
    await api()
      .page.getByRole('alertdialog', {name: 'Screen recording replay'})
      .getByText('Recording expired.')
      .waitFor({state: 'visible', timeout: 15_000})
  }, 120_000)
})

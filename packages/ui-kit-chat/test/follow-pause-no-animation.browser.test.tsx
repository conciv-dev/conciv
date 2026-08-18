import 'virtual:uno.css'
import {expect, it} from 'vitest'
import {page} from 'vitest/browser'
import {createSignal} from 'solid-js'
import {usePauseFollowOnToggle} from '../src/behaviors/use-follow-pause.js'
import {mountView} from './mount-view.js'

function Harness(props: {onSettle: (durationMs: number) => void}) {
  let target: HTMLDivElement | undefined
  const [phase, setPhase] = createSignal('idle')
  const settle = usePauseFollowOnToggle(
    () => target,
    (durationMs) => {
      props.onSettle(durationMs)
      setPhase(durationMs >= 1000 ? 'ceiling' : 'released')
    },
  )
  return (
    <div>
      <div ref={(el) => (target = el)}>target with no animation class</div>
      <span role="status">{phase()}</span>
      <button type="button" onClick={settle}>
        toggle
      </button>
    </div>
  )
}

it('releases follow pause immediately when the toggled content has no running animation', async () => {
  const durations: number[] = []
  mountView(() => <Harness onSettle={(durationMs) => durations.push(durationMs)} />)

  await page.getByRole('button').click()

  await expect.element(page.getByRole('status'), {timeout: 400}).toHaveTextContent('released')
  expect(durations[0]).toBeGreaterThanOrEqual(1000)
  expect(durations[durations.length - 1]).toBeLessThan(1000)
})

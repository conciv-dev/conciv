import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {ConcivLockup} from './solid/conciv-lockup.js'
import landscapeCrimsonLight from '../assets/lockups/landscape-crimson-on-light.svg'
import landscapeCrimsonDark from '../assets/lockups/landscape-crimson-on-dark.svg'
import landscapeMonoCream from '../assets/lockups/landscape-mono-light.svg'
import landscapeMonoCharcoal from '../assets/lockups/landscape-mono-dark.svg'
import stackedCrimsonLight from '../assets/lockups/stacked-crimson-on-light.svg'
import stackedCrimsonDark from '../assets/lockups/stacked-crimson-on-dark.svg'
import stackedMonoCream from '../assets/lockups/stacked-mono-light.svg'
import stackedMonoCharcoal from '../assets/lockups/stacked-mono-dark.svg'
import wordmarkCrimsonLight from '../assets/lockups/wordmark-crimson-on-light.svg'
import wordmarkCrimsonDark from '../assets/lockups/wordmark-crimson-on-dark.svg'
import wordmarkMonoCream from '../assets/lockups/wordmark-mono-light.svg'
import wordmarkMonoCharcoal from '../assets/lockups/wordmark-mono-dark.svg'

const meta: Meta<typeof ConcivLockup> = {title: 'brand/Lockup', component: ConcivLockup}
export default meta
type Story = StoryObj<typeof ConcivLockup>

function ToneRow(props: {label: string; light: string; dark: string}) {
  return (
    <div class="flex gap-4 items-center">
      <span class="text-xs w-24">{props.label}</span>
      <img src={props.light} alt={`conciv ${props.label}, on light`} class="h-14" />
      <div class="p-2 rounded" style={{background: '#15161A'}}>
        <img src={props.dark} alt={`conciv ${props.label}, on dark`} class="h-14" />
      </div>
    </div>
  )
}

export const Landscape: Story = {
  render: () => (
    <div class="flex flex-col gap-4">
      <ToneRow label="crimson" light={landscapeCrimsonLight} dark={landscapeCrimsonDark} />
      <ToneRow label="mono" light={landscapeMonoCharcoal} dark={landscapeMonoCream} />
    </div>
  ),
}

export const Stacked: Story = {
  render: () => (
    <div class="flex flex-col gap-4">
      <ToneRow label="crimson" light={stackedCrimsonLight} dark={stackedCrimsonDark} />
      <ToneRow label="mono" light={stackedMonoCharcoal} dark={stackedMonoCream} />
    </div>
  ),
}

export const Wordmark: Story = {
  render: () => (
    <div class="flex flex-col gap-4">
      <ToneRow label="crimson" light={wordmarkCrimsonLight} dark={wordmarkCrimsonDark} />
      <ToneRow label="mono" light={wordmarkMonoCharcoal} dark={wordmarkMonoCream} />
    </div>
  ),
}

export const Component: Story = {
  render: () => <ConcivLockup class="h-14" />,
}

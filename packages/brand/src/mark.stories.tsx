import type {Meta, StoryObj} from 'storybook-solidjs-vite'
import {ConcivMark} from './solid/index.js'
import markMono from '../assets/marks/mark-mono.svg'
import markCharcoal from '../assets/marks/mark-charcoal.svg'
import markCream from '../assets/marks/mark-cream.svg'
import mark16 from '../assets/marks/mark-16.svg'

const meta: Meta<typeof ConcivMark> = {title: 'brand/Mark', component: ConcivMark}
export default meta
type Story = StoryObj<typeof ConcivMark>

export const Tones: Story = {
  render: () => (
    <div class="flex gap-6 items-center">
      <figure class="flex flex-col gap-2 items-center">
        <ConcivMark class="h-16 w-16" />
        <figcaption class="text-xs">crimson</figcaption>
      </figure>
      <figure class="p-2 rounded flex flex-col gap-2 items-center" style={{background: '#15161A'}}>
        <img src={markMono} alt="conciv mark, mono" class="h-16 w-16" />
        <figcaption class="text-xs">mono</figcaption>
      </figure>
      <figure class="p-2 rounded flex flex-col gap-2 items-center" style={{background: '#F3EEE4'}}>
        <img src={markCharcoal} alt="conciv mark, charcoal" class="h-16 w-16" />
        <figcaption class="text-xs" style={{color: '#15161A'}}>
          charcoal
        </figcaption>
      </figure>
      <figure class="p-2 rounded flex flex-col gap-2 items-center" style={{background: '#15161A'}}>
        <img src={markCream} alt="conciv mark, cream" class="h-16 w-16" />
        <figcaption class="text-xs">cream</figcaption>
      </figure>
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div class="flex gap-6 items-end">
      <figure class="flex flex-col gap-2 items-center">
        <ConcivMark class="h-32 w-32" />
        <figcaption class="text-xs">128px</figcaption>
      </figure>
      <figure class="flex flex-col gap-2 items-center">
        <ConcivMark class="h-16 w-16" />
        <figcaption class="text-xs">64px</figcaption>
      </figure>
      <figure class="flex flex-col gap-2 items-center">
        <ConcivMark class="h-8 w-8" />
        <figcaption class="text-xs">32px</figcaption>
      </figure>
      <figure class="flex flex-col gap-2 items-center">
        <img src={mark16} alt="conciv mark, 16px cut" class="h-4 w-4" />
        <figcaption class="text-xs">16px (favicon cut, fused ears)</figcaption>
      </figure>
    </div>
  ),
}

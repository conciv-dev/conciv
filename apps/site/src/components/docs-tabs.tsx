'use client'

import type {ComponentProps, MouseEvent, ReactNode} from 'react'
import {Tabs as FumadocsTabs} from 'fumadocs-ui/components/tabs'

function placeIndicator(list: HTMLElement) {
  const active = list.querySelector<HTMLElement>(':scope > [role="tab"][data-state="active"]')
  if (active === null || active.offsetWidth === 0) {
    list.removeAttribute('data-tab-indicator')
    return
  }
  list.style.setProperty('--tab-left', `${active.offsetLeft}px`)
  list.style.setProperty('--tab-width', `${active.offsetWidth}px`)
  list.setAttribute('data-tab-indicator', '')
}

function watchTabs(wrapper: HTMLDivElement) {
  const list = wrapper.querySelector<HTMLElement>(':scope > * > [role="tablist"]')
  if (list === null) return
  const place = () => placeIndicator(list)
  const states = new MutationObserver(place)
  states.observe(list, {subtree: true, attributeFilter: ['data-state']})
  const sizes = new ResizeObserver(place)
  sizes.observe(list)
  for (const tab of list.querySelectorAll(':scope > [role="tab"]')) sizes.observe(tab)
  place()
  return () => {
    states.disconnect()
    sizes.disconnect()
  }
}

function focusWithoutRing(event: MouseEvent<HTMLDivElement>) {
  if (event.button !== 0 || event.ctrlKey || !(event.target instanceof Element)) return
  const tab = event.target.closest<HTMLElement>('[role="tab"]')
  if (tab === null || !event.currentTarget.contains(tab)) return
  tab.focus({focusVisible: false})
}

export function SlidingTabs({children}: {children: ReactNode}) {
  return (
    <div className="contents" data-sliding-tabs="" ref={watchTabs} onMouseDownCapture={focusWithoutRing}>
      {children}
    </div>
  )
}

export function Tabs(props: ComponentProps<typeof FumadocsTabs>) {
  return (
    <SlidingTabs>
      <FumadocsTabs {...props} />
    </SlidingTabs>
  )
}

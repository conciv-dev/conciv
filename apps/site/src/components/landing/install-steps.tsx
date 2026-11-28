'use client'

import type {ReactNode} from 'react'
import AnimatedContent from '@/components/AnimatedContent'
import {FRAMEWORK_SNIPPETS} from 'site-snippets'
import {CopyButton} from './copy-button'
import {FrameworkTabs} from './framework-tabs'

export const INIT_COMMAND = 'npx @conciv/cli@latest init'

export function InstallStep({
  number,
  title,
  body,
  children,
}: {
  number: string
  title: string
  body: string
  children?: ReactNode
}) {
  return (
    <AnimatedContent
      distance={36}
      duration={0.65}
      ease="power3.out"
      threshold={0.2}
      className="not-prose grid grid-cols-1 gap-2 border-t text-base leading-normal py-[30px] last:border-b sm:grid-cols-[88px_1fr] sm:gap-6"
    >
      <div
        aria-hidden
        className="od-display text-[44px] font-extrabold leading-[0.9] tracking-[-0.04em] text-accent [-webkit-text-stroke:1.5px_var(--od-accent)] sm:text-[56px]"
      >
        {number}
      </div>
      <div className="min-w-0">
        <h3 className="mb-1.5 text-[17px] font-semibold tracking-[-0.01em]">{title}</h3>
        <p className="mb-3 max-w-[46ch] text-[13.5px] text-muted-foreground">{body}</p>
        {children}
      </div>
    </AnimatedContent>
  )
}

function InitCommand() {
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] border bg-card py-2 pr-2 pl-4 font-mono text-[12.5px] leading-[1.7]">
      <span className="text-primary">$</span>
      <span className="min-w-0 flex-1 wrap-anywhere">{INIT_COMMAND}</span>
      <CopyButton.Root text={INIT_COMMAND}>
        <CopyButton.Trigger label="Copy install command" />
        <CopyButton.Feedback />
      </CopyButton.Root>
    </div>
  )
}

export function InstallSteps() {
  return (
    <>
      <InstallStep
        number="1"
        title="Install"
        body="Run init in your app folder. It adds one dev dependency and wires conciv into your build config. Nothing ships to production."
      >
        <InitCommand />
      </InstallStep>
      <InstallStep
        number="2"
        title="What init writes"
        body="Pick your build to see the config init writes, or add it by hand. Every entry is one import."
      >
        <FrameworkTabs.Root snippets={FRAMEWORK_SNIPPETS}>
          <FrameworkTabs.List />
          <FrameworkTabs.Panel>
            <FrameworkTabs.FileBar />
            <FrameworkTabs.Code />
            <FrameworkTabs.Note />
          </FrameworkTabs.Panel>
        </FrameworkTabs.Root>
      </InstallStep>
    </>
  )
}

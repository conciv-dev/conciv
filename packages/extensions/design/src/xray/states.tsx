import {Show, type JSX} from 'solid-js'
import {RelativeTime} from '@conciv/ui-kit-system'
import type {Filter} from './data.js'
import {RunButton} from './panel.js'

const PLURAL = new Intl.PluralRules(undefined)

function components(total: number): string {
  return `${total} ${PLURAL.select(total) === 'one' ? 'component' : 'components'}`
}

function EmptyState(props: {icon: string; title: JSX.Element; children?: JSX.Element}): JSX.Element {
  return (
    <div class="px-4 flex-1 grid place-items-center">
      <div class="text-center flex flex-col gap-3 items-center">
        <span class={`${props.icon} text-4xl op-fade`} aria-hidden="true" />
        <h2 class="text-lg font-medium m-0 text-balance">{props.title}</h2>
        {props.children}
      </div>
    </div>
  )
}

export function Loading(): JSX.Element {
  return (
    <div role="status" class="flex-1 grid place-items-center">
      <span class="op-fade flex gap-2 items-center">
        <span class="i-ph-circle-notch animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Loading the x-ray…
      </span>
    </div>
  )
}

export function LoadError(props: {message: string; onRetry: () => void}): JSX.Element {
  return (
    <div role="alert" class="flex flex-1 flex-col">
      <EmptyState icon="i-ph-warning-duotone" title="The x-ray could not load this target">
        <p class="text-sm font-mono m-0 op-fade max-w-160 break-all text-pretty">{props.message}</p>
        <button type="button" class="btn-action-sm" onClick={() => props.onRetry()}>
          <span class="i-ph-arrow-clockwise-duotone" aria-hidden="true" />
          Retry
        </button>
      </EmptyState>
    </div>
  )
}

export function NoRun(props: {route: string; width: number; running: boolean; onRun: () => void}): JSX.Element {
  return (
    <EmptyState
      icon="i-ph-image-duotone"
      title={
        <>
          No diff for <span class="font-mono">{props.route}</span> at {props.width}
        </>
      }
    >
      <p class="text-sm m-0 op-fade">Run the diff to compare the live page with the design.</p>
      <RunButton primary running={props.running} onRun={props.onRun} />
    </EmptyState>
  )
}

export function AllMatch(props: {
  width: number
  total: number
  ranAt: number | null
  stale: boolean
  running: boolean
  onRun: () => void
}): JSX.Element {
  return (
    <EmptyState
      icon="i-ph-check-circle-duotone text-green-600 dark:text-green-400"
      title={`Matches the design at ${props.width}`}
    >
      <p class="text-sm m-0 op-fade tabular-nums">
        {components(props.total)}, 0 properties off
        <Show when={props.ranAt}>
          {(at) => (
            <>
              {' · diffed '}
              <RelativeTime value={new Date(at())} />
            </>
          )}
        </Show>
      </p>
      <Show when={props.stale}>
        <RunButton running={props.running} onRun={props.onRun} />
      </Show>
    </EmptyState>
  )
}

export function NothingShown(props: {query: string; filter: Filter; onClear: () => void}): JSX.Element {
  const text = () => {
    if (props.filter === 'none') return 'Nothing selected. Turn on Off.'
    return props.query.trim() === ''
      ? 'No component in this selection.'
      : `No component matches “${props.query.trim()}”.`
  }
  return (
    <div class="flex-1 grid place-items-center">
      <div class="flex flex-col gap-3 items-center">
        <p class="text-sm m-0 text-center op-fade">{text()}</p>
        <Show when={props.query.trim() !== ''}>
          <button type="button" class="btn-action-sm" onClick={() => props.onClear()}>
            <span class="i-ph-x-circle-duotone" aria-hidden="true" />
            Clear search
          </button>
        </Show>
      </div>
    </div>
  )
}

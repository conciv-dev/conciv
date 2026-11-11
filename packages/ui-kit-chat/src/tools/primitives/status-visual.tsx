import {Match, Switch, splitProps, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {cva} from 'class-variance-authority'
import Check from 'lucide-solid/icons/check'
import CircleAlert from 'lucide-solid/icons/circle-alert'
import Ban from 'lucide-solid/icons/ban'
import CircleX from 'lucide-solid/icons/circle-x'
import LoaderCircle from 'lucide-solid/icons/loader-circle'
import type {LucideIcon} from 'lucide-solid'
import {StatusDot, type StatusDotTone} from '@conciv/ui-kit-system'
import type {ToolStatus} from './tool-status.js'
import {OUTCOME_TONE} from './tool-presentation.js'

const STATUS_LABEL: Record<ToolStatus, string> = {
  running: 'running',
  complete: 'complete',
  error: 'error',
  approval: 'needs approval',
  denied: 'denied',
  cancelled: 'cancelled',
}

const DOT_TONE: Record<ToolStatus, StatusDotTone> = {
  running: 'accent',
  complete: 'success',
  error: OUTCOME_TONE.error.dot,
  approval: 'accent',
  denied: OUTCOME_TONE.denied.dot,
  cancelled: OUTCOME_TONE.cancelled.dot,
}

const ICON: Record<ToolStatus, LucideIcon> = {
  running: LoaderCircle,
  complete: Check,
  error: CircleX,
  approval: CircleAlert,
  denied: Ban,
  cancelled: Ban,
}

const icon = cva('shrink-0', {
  variants: {
    status: {
      running: 'text-chat-text-3 anim-tool-spin',
      complete: 'text-chat-success',
      error: OUTCOME_TONE.error.text,
      approval: 'text-chat-accent',
      denied: OUTCOME_TONE.denied.text,
      cancelled: OUTCOME_TONE.cancelled.text,
    },
  },
})

function DotVisual(props: {status: ToolStatus}): JSX.Element {
  const [, rest] = splitProps(props, ['status'])
  return (
    <span {...rest} class="inline-flex shrink-0" role="img" aria-label={STATUS_LABEL[props.status]}>
      <StatusDot tone={DOT_TONE[props.status]} pulse={props.status === 'running'} />
    </span>
  )
}

function IconVisual(props: {status: ToolStatus}): JSX.Element {
  const [, rest] = splitProps(props, ['status'])
  return (
    <Dynamic
      {...rest}
      component={ICON[props.status]}
      size={16}
      role="img"
      aria-label={STATUS_LABEL[props.status]}
      class={icon({status: props.status})}
    />
  )
}

export function StatusVisual(props: {status: ToolStatus; form: 'dot' | 'icon'}): JSX.Element {
  const [local, rest] = splitProps(props, ['status', 'form'])
  return (
    <Switch>
      <Match when={local.form === 'dot'}>
        <DotVisual {...rest} status={local.status} />
      </Match>
      <Match when={local.form === 'icon'}>
        <IconVisual {...rest} status={local.status} />
      </Match>
    </Switch>
  )
}

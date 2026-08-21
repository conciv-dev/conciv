import {Match, Switch, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {cva} from 'class-variance-authority'
import Check from 'lucide-solid/icons/check'
import CircleAlert from 'lucide-solid/icons/circle-alert'
import CircleX from 'lucide-solid/icons/circle-x'
import LoaderCircle from 'lucide-solid/icons/loader-circle'
import type {LucideIcon} from 'lucide-solid'
import {StatusDot, type StatusDotTone} from '@conciv/ui-kit-system'
import type {ToolStatus} from './tool-status.js'

const STATUS_LABEL: Record<ToolStatus, string> = {
  running: 'running',
  complete: 'complete',
  error: 'error',
  approval: 'needs approval',
}

const DOT_TONE: Record<ToolStatus, StatusDotTone> = {
  running: 'accent',
  complete: 'success',
  error: 'danger',
  approval: 'accent',
}

const ICON: Record<ToolStatus, LucideIcon> = {
  running: LoaderCircle,
  complete: Check,
  error: CircleX,
  approval: CircleAlert,
}

const icon = cva('shrink-0', {
  variants: {
    status: {
      running: 'text-chat-text-3 anim-tool-spin',
      complete: 'text-chat-success',
      error: 'text-chat-danger',
      approval: 'text-chat-accent',
    },
  },
})

function DotVisual(props: {status: ToolStatus}): JSX.Element {
  return (
    <span class="inline-flex shrink-0" role="img" aria-label={STATUS_LABEL[props.status]}>
      <StatusDot tone={DOT_TONE[props.status]} pulse={props.status === 'running'} />
    </span>
  )
}

function IconVisual(props: {status: ToolStatus}): JSX.Element {
  return (
    <Dynamic
      component={ICON[props.status]}
      size={16}
      role="img"
      aria-label={STATUS_LABEL[props.status]}
      class={icon({status: props.status})}
    />
  )
}

export function StatusVisual(props: {status: ToolStatus; form: 'dot' | 'icon'}): JSX.Element {
  return (
    <Switch>
      <Match when={props.form === 'dot'}>
        <DotVisual status={props.status} />
      </Match>
      <Match when={props.form === 'icon'}>
        <IconVisual status={props.status} />
      </Match>
    </Switch>
  )
}

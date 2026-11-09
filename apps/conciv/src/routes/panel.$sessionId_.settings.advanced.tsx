import {Link, Outlet, createFileRoute} from '@tanstack/solid-router'
import type {JSX} from 'solid-js'
import RotateCcw from 'lucide-solid/icons/rotate-ccw'
import {SettingsSection} from '../settings/settings-section.js'

const ROW = 'flex items-start justify-between gap-4 py-3 px-3.5'
const TEXT = 'flex flex-col gap-0.5 min-w-0'
const LABEL = 'text-[0.8125rem] leading-snug font-medium text-chat-text-hi'
const HELP = 'text-[0.75rem] leading-snug text-chat-text-2'
const RESET =
  'inline-flex shrink-0 items-center gap-1.5 min-h-8 py-1 px-3 rounded-chat-surface-md [border:1px_solid_var(--chat-line-2)] bg-transparent font-chat text-[0.8125rem] text-chat-text no-underline cursor-pointer trans-btn focus-ring hover:border-chat-danger hover:text-chat-danger'

export const Route = createFileRoute('/panel/$sessionId_/settings/advanced')({component: AdvancedSettings})

function AdvancedSettings(): JSX.Element {
  return (
    <>
      <SettingsSection title="Reset">
        <div class={ROW}>
          <div class={TEXT}>
            <span class={LABEL}>Reset all conciv settings</span>
            <span class={HELP}>Appearance, views and shortcuts go back to their defaults for this project.</span>
          </div>
          <Link from={Route.fullPath} to="./reset" class={RESET}>
            <RotateCcw class="size-3.5" aria-hidden="true" />
            Reset all settings
          </Link>
        </div>
      </SettingsSection>
      <Outlet />
    </>
  )
}

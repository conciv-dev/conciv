import {createFileRoute} from '@tanstack/solid-router'
import type {JSX} from 'solid-js'
import {useAnnounce, useAppData, useAppQueryClient, useRpc, useWidgetSettings} from '../app/context.js'
import {SchemeField} from '../settings/scheme-field.js'
import {createSchemeWrites} from '../settings/scheme-writes.js'

const COLUMN = 'chat-settings-column anim-msg'
const FOOTER = 'text-[11px] [color:var(--chat-microlabel)] pt-1'

export const Route = createFileRoute('/panel/settings/appearance')({component: AppearanceSection})

function AppearanceSection(): JSX.Element {
  const rpc = useRpc()
  const data = useAppData()
  const queryClient = useAppQueryClient()
  const announce = useAnnounce()
  const settings = useWidgetSettings()
  const writes = createSchemeWrites({rpc, data, queryClient, announce})

  return (
    <div class={COLUMN}>
      <SchemeField
        setting={settings.scheme}
        writes={writes}
        data={data}
        queryClient={queryClient}
        isError={settings.isError}
        retry={settings.retry}
      />
      <p class={FOOTER}>Changes save automatically to this project.</p>
    </div>
  )
}

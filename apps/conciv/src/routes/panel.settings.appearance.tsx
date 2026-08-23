import {createFileRoute} from '@tanstack/solid-router'
import type {JSX} from 'solid-js'
import {useAnnounce, useAppData, useAppQueryClient, useRpc, useWidgetSettings} from '../app/context.js'
import {SchemeField} from '../settings/scheme-field.js'
import {createSchemeWrites} from '../settings/scheme-writes.js'

export const Route = createFileRoute('/panel/settings/appearance')({component: AppearanceSection})

function AppearanceSection(): JSX.Element {
  const rpc = useRpc()
  const data = useAppData()
  const queryClient = useAppQueryClient()
  const announce = useAnnounce()
  const settings = useWidgetSettings()
  const writes = createSchemeWrites({rpc, data, queryClient, announce, revisions: settings.revisions})

  return (
    <>
      <section class="chat-settings-card anim-msg">
        <SchemeField
          setting={settings.scheme}
          writes={writes}
          isLoading={settings.isLoading}
          isError={settings.isError}
          retry={settings.retry}
        />
      </section>
      <p class="chat-settings-footer">
        <span class="chat-settings-footer-label">SCOPE</span>
        Changes save automatically to this project.
      </p>
    </>
  )
}

import {createFileRoute} from '@tanstack/solid-router'
import type {JSX} from 'solid-js'
import {useQuery} from '@conciv/client'
import {useAppData, useConnected} from '../app/context.js'
import {ExtensionPlugins} from '../runtime/plugin/extension-plugins.js'

export const Route = createFileRoute('/panel/$sessionId_/settings/plugins/')({component: InstalledPlugins})

function InstalledPlugins(): JSX.Element {
  const appData = useAppData()
  const connected = useConnected()
  const list = useQuery(() => ({...appData.utils.plugin.list.queryOptions(), enabled: connected()}))
  return <ExtensionPlugins plugins={list.data?.data ?? []} />
}

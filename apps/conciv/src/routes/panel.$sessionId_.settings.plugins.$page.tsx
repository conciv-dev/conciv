import {createFileRoute} from '@tanstack/solid-router'
import {PluginSettingsPages} from '../runtime/plugin/settings-page-view.js'

export const Route = createFileRoute('/panel/$sessionId_/settings/plugins/$page')({component: PluginSettingsPages})

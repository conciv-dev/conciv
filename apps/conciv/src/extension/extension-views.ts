import type {ExtensionView} from '@conciv/extension'
import type {ExtensionInstance} from './extension-slots.js'

export type PanelView = ExtensionView & {instance: ExtensionInstance}

export function collectViews(instances: ExtensionInstance[]): PanelView[] {
  return instances.flatMap((instance) => (instance.extension.views ?? []).map((view) => ({...view, instance})))
}

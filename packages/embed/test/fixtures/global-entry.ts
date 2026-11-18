import type {AnyExtension} from '@conciv/extension'
import recorder from '@conciv/extension-recorder/client'
import {mountConciv} from '../../src/mount.js'

const available: AnyExtension[] = [recorder]

function mounted(search: string): AnyExtension[] {
  const requested = new URLSearchParams(search).get('extensions')
  if (requested === null) return available
  const names = requested.split(',')
  return available.filter((extension) => names.includes(extension.name))
}

void mountConciv(mounted(window.location.search))

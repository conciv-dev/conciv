import terminal from '@conciv/extension-terminal'
import testRunner from '@conciv/extension-test-runner'
import whiteboard from '@conciv/extension-whiteboard'
import recorder from '@conciv/extension-recorder'
import iosServer from '@conciv/extension-ios'
import design from '@conciv/extension-design'
import type {AnyExtension} from '@conciv/extension'

export const builtinServerExtensions: readonly AnyExtension[] = [
  terminal,
  testRunner,
  whiteboard,
  recorder,
  iosServer,
  design,
]

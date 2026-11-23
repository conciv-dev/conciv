import type {AppIconName} from '@conciv/plugin/experimental'
import type {iconNames} from '@conciv/ui-kit-chat'

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

export const iconNamesMatch: Same<AppIconName, ReturnType<typeof iconNames>[number]> = true

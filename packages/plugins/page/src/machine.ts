export * as PageMachine from './machine.js'
import {Tool, type Rule} from '@conciv/backend-plugin-api'
import type {BrowserTab, BrowserTabList} from '@conciv/protocol/schema/browser-tab'
import {id as skillId} from './skill.js'

export const ACCESS = [
  {action: 'page', resource: '*'},
  {action: 'skill', resource: skillId},
] as const

export function reconcilePagePermissions(current: readonly Rule[] | undefined, allow: boolean): Rule[] | undefined {
  const rules = current ?? []
  const kept = rules.filter(
    (rule) =>
      rule.effect !== 'allow' ||
      !ACCESS.some((access) => access.action === rule.action && access.resource === rule.resource),
  )
  const next = allow ? [...kept, ...ACCESS.map((rule) => ({...rule, effect: 'allow' as const}))] : kept
  const unchanged =
    next.length === rules.length &&
    next.every(
      (rule, index) =>
        rule.action === rules[index]?.action &&
        rule.resource === rules[index]?.resource &&
        rule.effect === rules[index]?.effect,
    )

  return unchanged ? undefined : next
}

function lastFocused(list: BrowserTabList) {
  return list.tabs.find((tab) => tab.id === list.focusedTabId) ?? list.tabs.find((tab) => tab.visible) ?? list.tabs[0]
}

export function selectTarget(
  list: BrowserTabList,
  tabId: string | undefined,
): {readonly ok: true; readonly tab: BrowserTab} | {readonly ok: false; readonly error: Tool.Error} {
  if (list.tabs.length === 0)
    return {
      ok: false,
      error: Tool.toolError({
        message:
          '[page.disconnected] No page is open in this session. Ask the user to open the page with the conciv panel and wait for it to connect. Then call page.tabs.list({}). Repeating page actions while disconnected will not help.',
        metadata: {code: 'no-widget', message: 'no widget connected to session'},
      }),
    }

  if (tabId !== undefined) {
    const named = list.tabs.find((tab) => tab.id === tabId)

    if (!named)
      return {
        ok: false,
        error: Tool.toolError({
          message:
            '[page.tab_unavailable] This tab is closed or does not belong to this session. Call page.tabs.list({}) and use an exact returned tabId, or omit tabId for the tab the user focused last. Never substitute an element ref for tabId.',
        }),
      }

    return {ok: true, tab: named}
  }
  const chosen = lastFocused(list)

  if (!chosen) return {ok: false, error: disconnectedBeforeDispatch()}

  return {ok: true, tab: chosen}
}

export function disconnectedBeforeDispatch() {
  return Tool.toolError({
    message:
      '[page.disconnected] The page disconnected before this action was sent; no action ran. Call page.tabs.list({}) once the page is open again.',
  })
}

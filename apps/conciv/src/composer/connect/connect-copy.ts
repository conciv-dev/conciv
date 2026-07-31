import type {LiveSession} from '@conciv/contract'

export const DIALOG_TITLE = 'Connect a running session'
export const CONNECTING_LABEL = 'Connecting…'
export const LOOKING_LABEL = 'Looking for running sessions…'
export const CHECKING_LABEL = 'Checking…'
export const RETRY_LABEL = 'Try again'
export const CHECK_AGAIN_LABEL = 'Check again'
export const REFRESH_LABEL = 'Check for running sessions again'
export const CANCEL_LABEL = 'Cancel'
export const OPEN_NEW_LABEL = 'Open a new session'
export const COPY_LABEL = 'Copy command'
export const DONE_LABEL = 'Done'
export const BACK_LABEL = 'Back to the list'
export const CLOSE_LABEL = 'Close'
export const UNDO_LABEL = 'Undo'
export const KEEP_WAITING_LABEL = 'Keep waiting'
export const HAND_BACK_LABEL = 'Hand it back'
export const HAND_BACK_CLOSE_LABEL = 'Hand it back and close'

export const LOOKUP_FAILED = 'Couldn’t check for running sessions.'
export const NOTHING_RUNNING_HINT = 'Start one and this panel follows it from the first message.'
export const ONE_TIME_SETUP = 'one-time setup'
export const UNTITLED_SESSION = 'Untitled — just started'
export const TRANSCRIPT_UNAVAILABLE = 'transcript unavailable'
export const PREVIEW_UNAVAILABLE = 'Can’t read this session’s transcript. Connecting still works.'
export const PREVIEW_EMPTY = 'No conversation yet.'
const STARTED_BEFORE_INSTALL = 'started before install — one reload in that terminal'
const SHELL_NOTE = 'exit the shell before connecting'
export const STALE_NOTICE = 'Not refreshing — last checked'
export const CHECKED_PREFIX = 'Checked'
export const AS_OF_LAST_CHECK = 'as of the last check'
export const WAITING_TO_DIAL_IN = 'Waiting for this session to dial in. It flips by itself.'
export const CONTACT_LOST = 'Lost contact with the server. Still trying.'
export const DIALLED_IN = 'Connected. Keep talking in either place.'
export const RELOAD_HEADS_UP = 'Your next message re-reads the conversation once, then stops.'
export const SNIPPET_HINT = 'Quit that session and start it again with this command instead.'
export const LEAVING_UNRELOADED = 'That terminal hasn’t reloaded yet. Leaving now hands the session back to it.'
export const LEAVING_HINT = 'You can connect it again whenever you like.'
export const HANDED_BACK = 'Handed back to your terminal.'
export const STILL_CONNECTED = 'Still connected to your terminal — messages here will be rejected.'

const STALE_AFTER_MS = 15_000

const plurals = new Intl.PluralRules('en')
const counts = new Intl.NumberFormat('en')

function activityOf(session: LiveSession): string {
  if (session.status === 'shell') return 'in a ! shell'
  return session.working ? 'working' : 'idle'
}

function messageCount(count: number): string {
  const noun = plurals.select(count) === 'one' ? 'message' : 'messages'
  return `${counts.format(count)} ${noun}`
}

export function candidateTitle(session: LiveSession): string {
  const title = session.title.trim()
  if (title !== '') return title
  return session.historyStatus === 'unavailable' ? session.name : UNTITLED_SESSION
}

export type MetaLine = {lead: string; timePrefix: string; at: number; notes: string[]}

export function metaLine(session: LiveSession): MetaLine {
  const spoken = session.messageCount > 0
  const notes: string[] = []
  if (!session.ready) notes.push(STARTED_BEFORE_INSTALL)
  if (session.status === 'shell') notes.push(SHELL_NOTE)
  if (session.historyStatus === 'unavailable') notes.push(TRANSCRIPT_UNAVAILABLE)
  return {
    lead: `${session.name} · ${activityOf(session)} · ${messageCount(session.messageCount)}`,
    timePrefix: spoken ? 'active' : 'started',
    at: spoken ? session.lastActivityAt : (session.startedAt ?? session.lastActivityAt),
    notes,
  }
}

export function subtitle(count: number, harnessName: string): string | null {
  if (count === 0) return null
  const verb = plurals.select(count) === 'one' ? 'session is' : 'sessions are'
  return `${counts.format(count)} ${harnessName} ${verb} running in this project. Pick the one this panel should follow.`
}

export function nothingRunning(harnessName: string): string {
  return `No ${harnessName} session is running here.`
}

export function connectFailed(harnessName: string): string {
  return `Couldn’t connect that ${harnessName} session.`
}

export function nowFollowing(title: string): string {
  return `Now following ${title}.`
}

export function isStale(dataUpdatedAt: number, now: number): boolean {
  if (dataUpdatedAt === 0) return false
  return now - dataUpdatedAt > STALE_AFTER_MS
}

export function checkedLabel(dataUpdatedAt: number): Date | null {
  return dataUpdatedAt === 0 ? null : new Date(dataUpdatedAt)
}

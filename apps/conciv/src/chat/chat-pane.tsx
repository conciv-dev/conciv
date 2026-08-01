import {createMemo, type JSX} from 'solid-js'
import {useRouter} from '@tanstack/solid-router'
import {useQuery} from '@tanstack/solid-query'
import {ChatProvider, ComposerHandlersProvider, ToolProvider} from '@conciv/ui-kit-chat'
import {HostApiProvider, type AnyExtension} from '@conciv/extension'
import {paneAttachments} from './pane-attachments.js'
import {useAnnounce, useAppData, useInstances, useRpc} from '../app/context.js'
import {usePane} from '../app/pane-context.js'
import {makePaneGrabApi} from '../extension/pane-grab.js'
import {useNotify} from '../shell/notices.js'
import {ComposerView, PaneFrame, ThreadView} from './pane-views.js'
import {TerminalConflictDialog} from './terminal-conflict-dialog.js'
import {useChatAnnouncements} from './use-chat-announcements.js'
import {useComposerBridge} from './use-composer-bridge.js'
import {useSendPipeline} from './use-send-pipeline.js'
import {useSessionMaintenance, useTurnNavigationBlock} from './use-session-maintenance.js'
import {useToolCards} from './use-tool-cards.js'

export function ChatPane(props: {sessionId: string}): JSX.Element {
  const rpc = useRpc()
  const appData = useAppData()
  const announce = useAnnounce()
  const instances = useInstances()
  const pane = usePane()
  const router = useRouter()
  const notify = useNotify()
  const sessionId = (): string => props.sessionId
  const meta = useQuery(() => appData.utils.meta.models.queryOptions())

  const maintenance = useSessionMaintenance({
    rpc,
    utils: appData.utils,
    sessionId,
    navigate: (created) => void router.navigate({to: '/panel/$sessionId', params: {sessionId: created}}),
    invalidateSessions: appData.invalidateSessions,
    announce,
    notify,
  })
  const bridge = useComposerBridge({rpc, utils: appData.utils, sessionId, pane})
  const pipeline = useSendPipeline({
    rpc,
    sessionId,
    pane,
    draft: bridge.draft,
    composer: bridge.composer,
    focusComposer: bridge.focusInput,
    busy: maintenance.compacting,
    notify,
    invalidateSessions: appData.invalidateSessions,
  })
  const chat = pipeline.chat
  const harnessId = (): string => meta.data?.harness.id ?? ''
  const cards = useToolCards({rpc, sessionId, instances, harnessId, chat, notify})
  const extensions = (): AnyExtension[] => instances.map((instance) => instance.extension)
  const attachments = createMemo(() => paneAttachments(extensions(), meta.data?.harness.imageInput))
  const paneGrab = makePaneGrabApi(pane.grabStore, pane.grabProvider)

  useChatAnnouncements({
    turn: pipeline,
    announce,
    invalidateSessions: appData.invalidateSessions,
    refreshMarkers: maintenance.refreshMarkers,
  })
  useTurnNavigationBlock(pipeline.working)

  return (
    <HostApiProvider
      sessionId={sessionId}
      grab={paneGrab}
      insert={bridge.insert}
      attach={bridge.attach}
      newSession={() => void maintenance.newSession()}
    >
      <TerminalConflictDialog
        conflict={pipeline.guard.conflict()}
        onCancel={pipeline.guard.cancel}
        onTakeOver={pipeline.guard.takeOver}
        onSendAnyway={pipeline.guard.sendAnyway}
      />
      <ChatProvider chat={chat}>
        <ToolProvider value={cards.toolCtx}>
          <ComposerHandlersProvider value={pipeline.handlers}>
            <PaneFrame>
              <ThreadView
                tools={cards.tools()}
                attachmentCards={attachments().cards}
                dividersInRange={maintenance.dividersInRange}
                footerDividers={maintenance.dividersAt(chat.messages().length)}
                compacting={maintenance.compacting()}
                thinking={pipeline.thinking()}
                nowTitle={cards.nowTitleText()}
                error={pipeline.visibleError()}
                viewportRef={bridge.viewportRef}
                onStop={() => chat.stop()}
                onRetry={() => void chat.reload()}
                onStarter={(starter) => void chat.sendMessage(starter)}
                composer={
                  <ComposerView
                    sessionId={props.sessionId}
                    disconnected={pipeline.disconnected()}
                    compacting={maintenance.compacting()}
                    attachments={attachments()}
                    inputRef={bridge.inputRef}
                    onCompact={maintenance.compact}
                    onNewSession={() => void maintenance.newSession()}
                    onStageGrab={bridge.stageGrab}
                    onComposerReady={bridge.onComposerReady}
                  />
                }
              />
            </PaneFrame>
          </ComposerHandlersProvider>
        </ToolProvider>
      </ChatProvider>
    </HostApiProvider>
  )
}

import {defineTool} from '@conciv/extension'
import {inlineTool} from '@conciv/ui-kit-chat-tools'
import {
  canvasClearDef,
  canvasCommitDef,
  canvasConnectDef,
  canvasDeleteDef,
  canvasDiagramDef,
  canvasDiscardDef,
  canvasDrawDef,
  canvasExportDef,
  canvasPreviewDef,
  canvasReadDef,
  canvasSvgDef,
  canvasUpdateDef,
} from './canvas/def.js'
import {
  commentCreateDef,
  commentDeleteDef,
  commentListDef,
  commentMoveDef,
  commentReadDef,
  commentReplyDef,
  commentResolveDef,
  pinSetStateDef,
} from './comment/def.js'
import {elementReferenceDef} from './element/def.js'
import {anchorResolveDef} from './anchor/def.js'
import {CanvasOpCard} from './canvas/card.js'
import {CommentOpCard} from './comment/card.js'

const ElementReferenceInline = inlineTool(['component'])
const AnchorResolveInline = inlineTool(['cid'])

export const whiteboardToolClients = [
  defineTool(canvasReadDef).render(CanvasOpCard),
  defineTool(canvasSvgDef).render(CanvasOpCard),
  defineTool(canvasPreviewDef).render(CanvasOpCard),
  defineTool(canvasExportDef).render(CanvasOpCard),
  defineTool(canvasDrawDef).render(CanvasOpCard),
  defineTool(canvasDiagramDef).render(CanvasOpCard),
  defineTool(canvasConnectDef).render(CanvasOpCard),
  defineTool(canvasUpdateDef).render(CanvasOpCard),
  defineTool(canvasDeleteDef).render(CanvasOpCard),
  defineTool(canvasClearDef).render(CanvasOpCard),
  defineTool(canvasCommitDef).render(CanvasOpCard),
  defineTool(canvasDiscardDef).render(CanvasOpCard),
  defineTool(commentCreateDef).render(CommentOpCard),
  defineTool(commentReplyDef).render(CommentOpCard),
  defineTool(commentReadDef).render(CommentOpCard),
  defineTool(commentListDef).render(CommentOpCard),
  defineTool(commentResolveDef).render(CommentOpCard),
  defineTool(commentDeleteDef).render(CommentOpCard),
  defineTool(commentMoveDef).render(CommentOpCard),
  defineTool(pinSetStateDef).render(CommentOpCard),
  defineTool(elementReferenceDef).render(ElementReferenceInline),
  defineTool(anchorResolveDef).render(AnchorResolveInline),
]

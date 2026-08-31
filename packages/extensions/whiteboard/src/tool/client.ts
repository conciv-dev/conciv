import {defineTool} from '@conciv/extension'
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
import {canvasOpCard} from './canvas/card.js'
import {commentOpCard} from './comment/card.js'
import {elementReferenceCard} from './element/card.js'
import {anchorResolveCard} from './anchor/card.js'

export const whiteboardToolClients = [
  defineTool(canvasReadDef).render(canvasOpCard),
  defineTool(canvasSvgDef).render(canvasOpCard),
  defineTool(canvasPreviewDef).render(canvasOpCard),
  defineTool(canvasExportDef).render(canvasOpCard),
  defineTool(canvasDrawDef).render(canvasOpCard),
  defineTool(canvasDiagramDef).render(canvasOpCard),
  defineTool(canvasConnectDef).render(canvasOpCard),
  defineTool(canvasUpdateDef).render(canvasOpCard),
  defineTool(canvasDeleteDef).render(canvasOpCard),
  defineTool(canvasClearDef).render(canvasOpCard),
  defineTool(canvasCommitDef).render(canvasOpCard),
  defineTool(canvasDiscardDef).render(canvasOpCard),
  defineTool(commentCreateDef).render(commentOpCard),
  defineTool(commentReplyDef).render(commentOpCard),
  defineTool(commentReadDef).render(commentOpCard),
  defineTool(commentListDef).render(commentOpCard),
  defineTool(commentResolveDef).render(commentOpCard),
  defineTool(commentDeleteDef).render(commentOpCard),
  defineTool(commentMoveDef).render(commentOpCard),
  defineTool(pinSetStateDef).render(commentOpCard),
  defineTool(elementReferenceDef).render(elementReferenceCard),
  defineTool(anchorResolveDef).render(anchorResolveCard),
]

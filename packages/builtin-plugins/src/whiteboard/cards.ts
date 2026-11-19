import type {ToolComponent} from '@conciv/plugin/experimental'
import {anchorCard} from './anchor-card.js'
import {canvasCard} from './canvas-card.js'
import {commentCard} from './comment-card.js'
import {elementCard} from './element-card.js'

export const whiteboardCards = {
  whiteboard_canvas_read: canvasCard,
  whiteboard_canvas_svg: canvasCard,
  whiteboard_canvas_preview: canvasCard,
  whiteboard_canvas_export: canvasCard,
  whiteboard_canvas_draw: canvasCard,
  whiteboard_canvas_diagram: canvasCard,
  whiteboard_canvas_connect: canvasCard,
  whiteboard_canvas_update: canvasCard,
  whiteboard_canvas_delete: canvasCard,
  whiteboard_canvas_clear: canvasCard,
  whiteboard_canvas_commit: canvasCard,
  whiteboard_canvas_discard: canvasCard,
  whiteboard_comment_create: commentCard,
  whiteboard_comment_reply: commentCard,
  whiteboard_comment_read: commentCard,
  whiteboard_comment_list: commentCard,
  whiteboard_comment_resolve: commentCard,
  whiteboard_comment_delete: commentCard,
  whiteboard_comment_move: commentCard,
  whiteboard_pin_set_state: commentCard,
  whiteboard_element_reference: elementCard,
  whiteboard_anchor_resolve: anchorCard,
} satisfies Record<string, ToolComponent>

import {schema, col} from 'jazz-tools'

export const app = schema.defineApp({
  canvasElements: schema.table({
    room: col.string(),
    elementId: col.string(),
    data: col.json(),
    version: col.int(),
  }),
  comments: schema.table({
    room: col.string(),
    cid: col.string(),
    body: col.string(),
    anchorJson: col.json().optional(),
    threadId: col.string().optional(),
    parentId: col.string().optional(),
    resolved: col.boolean().default(false),
    author: col.string(),
    createdAt: col.timestamp(),
  }),
  pins: schema.table({
    room: col.string(),
    cid: col.string(),
    x: col.float(),
    y: col.float(),
    state: col.string(),
  }),
  cursors: schema.table({
    room: col.string(),
    sessionId: col.string(),
    x: col.float(),
    y: col.float(),
    name: col.string(),
    color: col.string(),
  }),
})

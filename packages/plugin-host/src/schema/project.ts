export * as Project from './project.js'

import {ProjectId} from './project-id.js'

export const Id = ProjectId
export type Id = typeof Id.Type

export * as Project from './project.js'

import {ProjectId} from '@conciv/plugin/schema/project-id'

export const Id = ProjectId
export type Id = typeof Id.Type

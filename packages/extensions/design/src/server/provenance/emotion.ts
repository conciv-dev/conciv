import type {ProvenanceMapper} from '../../shared/types.js'

export const emotionMapper: ProvenanceMapper = {
  via: 'emotion',
  applies: ({winner}) => winner.sheet.emotion,
  map: ({component, winner}) =>
    Promise.resolve({
      via: 'emotion',
      ...(component.source === null ? {} : {file: component.source.file}),
      ...(winner.selector === null ? {} : {selector: winner.selector}),
    }),
}

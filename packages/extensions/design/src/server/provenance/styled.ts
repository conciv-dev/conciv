import type {ProvenanceMapper} from '../../shared/types.js'

export const styledMapper: ProvenanceMapper = {
  via: 'styled',
  applies: ({winner}) => winner.sheet.styled,
  map: ({component, winner}) =>
    Promise.resolve({
      via: 'styled',
      ...(component.source === null ? {} : {file: component.source.file}),
      ...(winner.selector === null ? {} : {selector: winner.selector}),
    }),
}

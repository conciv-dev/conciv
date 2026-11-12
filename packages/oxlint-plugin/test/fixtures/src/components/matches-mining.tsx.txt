import {useRouterState} from '@tanstack/react-router'

export function IsHome() {
  const home = useRouterState({select: (state) => state.matches.some((match) => match.routeId === '/')})
  return <span>{String(home)}</span>
}

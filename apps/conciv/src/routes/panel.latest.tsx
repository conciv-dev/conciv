import {createFileRoute, redirect} from '@tanstack/solid-router'

export const Route = createFileRoute('/panel/latest')({
  beforeLoad: async ({context}) => {
    const {sessionId} = await context.rpc.sessions.resolve({})
    throw redirect({to: '/panel/$sessionId', params: {sessionId}, replace: true})
  },
})

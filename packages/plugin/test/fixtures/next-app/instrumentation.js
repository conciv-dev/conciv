const addedDevframe = {
  id: 'added',
  name: 'added',
  version: '0.0.0',
  packageName: 'added',
  homepage: 'https://conciv.dev',
  description: 'a user devframe added at register time',
  setup(ctx) {
    ctx.rpc.register({name: 'added:ping', type: 'query', handler: () => 'pong'})
  },
}

export async function register() {
  const {register: registerConciv} = await import('@conciv/plugin/nextjs')
  await registerConciv({devframes: {add: [addedDevframe]}})
}

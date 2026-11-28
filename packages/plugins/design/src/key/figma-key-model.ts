import {createStore} from 'solid-js/store'
import {useMutation, useQuery, useQueryClient, type ConcivClient} from '@conciv/client'

export const FIGMA_INTEGRATION = 'figma'
export const FIGMA_KEY_SETTINGS = 'figma'

const KEYS = ['design', 'figma-key'] as const

export function createFigmaKey(client: ConcivClient) {
  const queryClient = useQueryClient()
  const [form, setForm] = createStore({draft: '', saved: false})
  const refresh = () => queryClient.invalidateQueries({queryKey: KEYS})
  const integration = useQuery(() => ({
    queryKey: [...KEYS, 'integration'],
    queryFn: () => client.integration.get({integrationId: FIGMA_INTEGRATION}),
    select: (answer) => ({fromEnv: answer.data.connections.some((connection) => connection.type === 'env')}),
  }))
  const saved = useQuery(() => ({
    queryKey: [...KEYS, 'saved'],
    queryFn: () => client.credential.list(),
    select: (credentials) => credentials.filter((credential) => credential.integrationId === FIGMA_INTEGRATION),
  }))
  const save = useMutation(() => ({
    mutationFn: (key: string) => client.integration.connect.key({integrationId: FIGMA_INTEGRATION, key}),
    onSuccess: () => {
      setForm({draft: '', saved: true})
      return refresh()
    },
  }))
  const remove = useMutation(() => ({
    mutationFn: (credentialId: string) => client.credential.remove({credentialId}),
    onSuccess: refresh,
  }))
  return {
    form,
    type: (draft: string) => setForm({draft, saved: false}),
    save: () => {
      const key = form.draft.trim()
      if (key !== '') save.mutate(key)
    },
    saving: () => save.isPending,
    failed: () => save.error?.message,
    remove: (credentialId: string) => remove.mutate(credentialId),
    saved: () => saved.data ?? [],
    fromEnv: () => integration.data?.fromEnv === true,
  }
}

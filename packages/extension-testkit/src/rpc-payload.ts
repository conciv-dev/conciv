import {StandardRPCJsonSerializer, StandardRPCSerializer} from '@orpc/client/standard'

const serializer = new StandardRPCSerializer(new StandardRPCJsonSerializer())

export function procedurePathOf(pathname: string): readonly string[] {
  return pathname
    .split('/')
    .filter((segment) => segment !== '')
    .map(decodeURIComponent)
}

export function rpcPayload(body: unknown): unknown {
  return serializer.deserialize(body)
}

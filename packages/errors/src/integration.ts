import {defineErrorCatalog} from 'evlog'

export const integrationErrors = defineErrorCatalog('integration', {
  CODE_REQUIRED: {
    status: 400,
    message: ({attemptId}: {attemptId: string}) => `Authorization code is required for attempt ${attemptId}`,
  },
  AUTHORIZATION: {
    status: 400,
    message: ({reason}: {reason: string}) => reason,
    why: 'The integration refused the sign-in or could not finish it.',
  },
  ATTEMPT_NOT_FOUND: {
    status: 404,
    message: ({integrationId, attemptId}: {integrationId: string; attemptId: string}) =>
      `Attempt not found: ${integrationId}/${attemptId}`,
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    integration: typeof integrationErrors
  }
}

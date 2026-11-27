import {description, name, option, schema, toggle} from '@bomb.sh/router'
import {LogLevelSchema} from '@conciv/types/config-types'

export const verboseFlag = toggle(
  name('verbose'),
  description("print the CLI's debug logs to stderr (same as --log-level debug)"),
)

export const logLevelFlag = option(
  name('log-level'),
  description(
    "print the CLI's logs at this level or above to stderr: off (the default), error, warn, info, debug, trace",
  ),
  schema(LogLevelSchema.optional()),
)

# conciv

## Overview

The conciv project folder for the TanStack Start example.

`plugins/deploy` is a conciv plugin: it gives the agent a deploy tool and adds a Deploy pill and the status text `env: staging` to the chat composer.
Run it from the terminal with `conciv plugin call deploy run --data '{"env":"staging"}'`.

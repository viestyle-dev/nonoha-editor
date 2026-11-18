# Environment settings

The top-right menu's **Environment settings** (engines with
`capabilities.env_settings`, 1.1+) lists the environment values the nodes of
the engine's loaded graphs read (API keys, ...): name, description, a link
to get a value, whether it is set and where from (`.env` or the OS).

- Values are write-only: the engine never sends them back, so the dialog
  shows status only. The input is a password field; the eye button shows
  what you type, never a stored value.
- Saving writes the engine's `.env` first, then nodes use the value at once.
  Libraries and child processes see it after the engine restarts.
- A name set in the OS environment wins over `.env` and cannot be changed
  here; names that steer processes or libraries (`PATH`, `*_PROXY`, ...)
  and names no node declares are refused.
- While the engine is stopped, nonoha Hub's workspace page and
  `nonoha ws env set` edit the same `.env`.

Client API (nonoha-client-js): `fetchEnvStatus`, `setEnv`, `clearEnv`,
`EnvError` (HTTP status and the engine's reason).

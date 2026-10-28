# Security Policy

## Reporting a Vulnerability

Please use GitHub's **Private Vulnerability Reporting**
(Security tab → "Report a vulnerability") on this repository.
Do not open public issues for security reports.

## Threat model

- **The editor is a frontend for a nonoha-engine endpoint.** It
  connects to the engine gateway URL chosen by the user (query
  parameter or settings dialog), over plain `http://` / `ws://`. Only
  connect to engines you trust, on networks you trust (the intended
  setup is a local engine on `127.0.0.1`).
- **Graphs are executed by the engine, not the editor.** Opening,
  editing or running a graph from the editor causes the connected
  engine to execute it. Graph definitions can execute code on the
  engine side — see the
  [nonoha-engine security policy](https://github.com/viestyle-dev/nonoha-engine/blob/main/SECURITY.md)
  for the engine threat model. Do not point the editor at an engine
  loaded with graphs from sources you do not trust.
- **The editor itself has no authentication.** Anyone who can reach
  the editor's engine can act on it through the same unauthenticated
  API the editor uses.

## Supported versions

Security fixes target the latest release.

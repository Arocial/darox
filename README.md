# Darox

Darox is a Next.js chat UI with an Electron desktop shell. Both the browser and
desktop app connect to Arox Profile Managers over HTTP and WebSocket. The app
itself never starts or owns backend processes.

## Development

```bash
npm install
npm run dev              # Frontend at http://localhost:3140
npm run electron:dev     # Frontend, local Manager, and Electron shell
```

`electron:dev` starts `arox-manager` from the project directory with the default
development token `AROX_API_TOKEN=1`. The command requires `arox-manager` on
PATH. Electron injects this local connection automatically, so it does not need
to be added through the frontend.

For browser-only development, start a Manager independently in another terminal:

```bash
npm run manager
npm run manager -- --config /path/to/manager.toml
```

This shortcut runs `arox-manager` in the project directory and inherits your
shell environment, including `AROX_API_TOKEN`. Workers inherit the Manager's
working directory and environment. To use a different workspace, launch
`arox-manager` directly from that directory.

## Manager configuration

Create `manager.toml` in Arox's platform user configuration directory
(`~/.config/arox/manager.toml` on Linux):

```toml
[server]
host = "127.0.0.1"
port = 3145

[profiles.coder]
autostart = true
port = 3142

[profiles.research]
port = 3143
```

Profiles use existing Arox chat profile configuration and session storage. Each
worker requires a unique fixed port. Edit this file and restart Manager to add
or remove profiles or change autostart settings. Local Managers currently require
Linux or macOS; Darox on Windows can connect to a remote Manager.

## Connections and profiles

Open Darox and add a named Manager connection, such as `http://127.0.0.1:3145`.
If Manager was started with `AROX_API_TOKEN`, enter the same token in Darox.
You can add, edit, or delete multiple connections in the Backend menu. Each
connection lists its profiles with their current state and any operation error.

- Selecting a stopped or failed profile starts it; running profiles connect
  immediately. Adding a Manager connection does not start stopped profiles.
- Restart and stop controls operate on the selected row's profile. Asynchronous
  operations remain pending until Manager reports completion.
- All connections refresh automatically. Unavailable Managers recover when they
  become reachable again. An unchanged poll does not restart chat connections.
- Profile identities include the Manager connection ID, so identically named
  profiles on different Managers have separate chat tabs.
- Connection settings and the selected Manager/profile are saved locally.
  Remembered tokens use localStorage; other tokens use sessionStorage.
- Deleting a connection or closing Darox does not stop remote workers or Manager.

Darox accesses worker APIs through `/api/profiles/<profile>/proxy` at the Manager
URL. Manager supports browser CORS preflights and authenticated cross-origin
requests. Local development connects directly and requires no Caddy or combined
stack script. For remote access, configure a reachable Manager address; an HTTPS
frontend should use an HTTPS Manager endpoint.

Old direct-worker connections, Electron backend lifecycle IPC, `dev:stack`, and
`~/.config/arox/profiles/chat/darox.json` are no longer used. Add Manager connections
in the UI and move profile ports/autostart settings to `manager.toml`.

## Verification and packaging

```bash
npm test                  # Manager client/store tests (Node 22.18+)
npx tsc --noEmit
npm run lint
npm run electron:compile
npm run build:check       # Isolated .next-check build, safe alongside npm run dev
npm run electron:build    # Production static export and desktop package
```

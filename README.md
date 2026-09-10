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

## PWA and local HTTPS

The web app includes an install manifest and icons for standalone installation.
There is no service worker, offline cache, or custom install prompt. Deploy at the
origin root rather than a subpath.

Start the frontend and an authenticated Manager separately, then run the optional
HTTPS proxy (requires Bash and Caddy on PATH):

```bash
npm run dev
AROX_API_TOKEN=your-secret npm run manager   # Another terminal
npm run https -- darox.example              # Another terminal; port 3143
# Multiple names/IPs, custom upstreams, and optional ports:
npm run https -- darox.example 192.168.1.20 \
  --manager 192.168.1.10:3145 --web 192.168.1.10:3140
npm run https -- darox.example:8443 192.168.1.20:8443 \
  --manager http://192.168.1.10:3145 --web http://192.168.1.10:3140
```

The script requires one or more hostname or IP address arguments; there is no
default domain. Each address uses port `3143` unless it includes another port.
The proxy binds the requested ports on `0.0.0.0` and uses `tls internal` to issue
a certificate covering every supplied hostname and IP address.
Configure name resolution on each client so every supplied hostname points to this computer's
LAN IP (for example via a hosts entry or an existing local name-resolution setup);
the script does not configure DNS or advertise mDNS. Ensure port 3143 is not
already occupied by a profile or another service.

It forwards `/api/*` unchanged to the Manager selected by `--manager` (default
`127.0.0.1:3145`), including WebSockets, and other requests to the web upstream
selected by `--web` (default `127.0.0.1:3140`). Both options accept Caddy upstreams
such as `server.lan:3145` or `http://server.lan:3145`. The existing
`DAROX_MANAGER_UPSTREAM` and `DAROX_WEB_UPSTREAM` variables remain available as
defaults when the corresponding option is omitted.
It does not start either upstream, and Ctrl+C stops only Caddy. For a production
static deployment, point the web upstream at an HTTP server serving `out/`.

Open any configured HTTPS URL, then add that **same HTTPS origin** as the Manager
URL in Darox and enter the Manager token. Do not use the
phone's `127.0.0.1` or an HTTP Manager URL. This proxy exposes Manager APIs to
clients that can reach its port, so keep token authentication enabled and restrict
network access appropriately.

Install and trust this Caddy instance's root CA on every client device before
using browser installation. Bypassing a certificate warning is not sufficient.
Run `caddy environ` as the same user running the script to locate `caddy.AppDataDir`;
the public certificate is `<caddy.AppDataDir>/pki/authorities/local/root.crt` after
the first start. Copy only `root.crt` to client devices, never the private key.
On iOS, also enable full trust for the installed root in Certificate Trust Settings.
The proxy does not listen on port 80 or redirect plain HTTP; open HTTPS explicitly.

## Verification and packaging

```bash
npm test                  # Manager client/store tests (Node 22.18+)
npx tsc --noEmit
npm run lint
npm run electron:compile
npm run build:check       # Isolated .next-check build, safe alongside npm run dev
npm run electron:build    # Production static export and desktop package
```

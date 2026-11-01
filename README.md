# Darox

Darox is a Next.js chat UI with an Electron desktop shell. Both the browser and
desktop app connect to Arox Profile Managers over HTTP and WebSocket. The
browser app never starts backend processes. On Linux/macOS, Electron starts or
reuses a local Manager and leaves it running when Darox exits.

## Development

```bash
npm install
npm run web:dev              # Frontend at http://localhost:3140
npm run electron:dev     # Frontend, local Manager, and Electron shell
```

`electron:dev` starts Next and Electron with the development token
`AROX_API_TOKEN=1`. Electron reuses a local Manager or starts `arox-manager`
from the user's home directory. It searches PATH and common user installation
locations, including `~/.local/bin`. Electron injects the connection automatically.
If an existing Manager uses another token, edit the Local Manager connection.
Closing development services does not stop the detached Manager.

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

## Desktop startup and token cache

Install and configure Arox separately before opening Darox. On Linux/macOS,
Darox checks `http://127.0.0.1:3145`: an existing listener is never replaced or
stopped, including when authentication fails. Otherwise it launches
`arox-manager` from the user's home directory, using its default `manager.toml`.
Workers inherit that working directory and environment. Startup errors are shown
without preventing remote connections; logs are in `manager.log` inside
Electron's user-data directory. Windows uses remote Managers only.

`AROX_API_TOKEN` takes precedence over the cached token and updates the cache.
Without it, Darox restores the cached token. Edit and save the injected Local
Manager connection to cache the token for an already-running service. Local
tokens are cached automatically, independent of the browser's Remember token
option. The cache is encrypted with AES-256-GCM using keys derived from machine
and user identity and stored with restricted `0600` permissions as
`manager-token.json` in user data, without requiring desktop secret services or
keyrings (such as KWallet or libsecret). Delete `manager-token.json` to clear
the cache.

An explicitly supplied `DAROX_MANAGER_URL` overrides the default connection;
remote URLs are connected to but never auto-started. A custom local port must
match the existing Manager configuration; this does not rewrite `manager.toml`.
`DAROX_MANAGER_NAME` sets the connection label. Add a separate connection in the
UI for another URL. The default new local service has no token unless one is
provided or cached; keep it bound to loopback, and set a token before exposing it.

Packaged/production Electron uses the `darox` user-data directory, separate from
the existing development `Electron` directory. `DAROX_USER_DATA_DIR` can isolate
smoke tests; instances sharing a user-data directory are single-instance.

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
  Remembered tokens for user-added connections use localStorage; other tokens
  use sessionStorage. The injected desktop connection uses the secure cache above.
- Deleting a connection or closing Darox does not stop remote workers or Manager.

Darox accesses worker APIs through `/api/profiles/<profile>/proxy` at the Manager
URL. Manager supports browser CORS preflights and authenticated cross-origin
requests. Local development connects directly and requires no Caddy or combined
stack script. For remote access, configure a reachable Manager address; an HTTPS
frontend should use an HTTPS Manager endpoint.

Old direct-worker connections, worker lifecycle IPC, `dev:stack`, and
`~/.config/arox/profiles/chat/darox.json` are no longer used. Add Manager connections
in the UI and move profile ports/autostart settings to `manager.toml`.

## PWA and local HTTPS

The web app includes an install manifest and icons for standalone installation.
There is no service worker, offline cache, or custom install prompt. Deploy at the
origin root rather than a subpath.

Build the static frontend and start an authenticated Manager, then run the HTTPS
server (requires Bash and Caddy on PATH):

```bash
npm run build
AROX_API_TOKEN=your-secret npm run manager   # Another terminal
npm run web -- darox.example              # Another terminal; port 3143
# Multiple names/IPs, custom upstreams, and optional ports:
npm run web -- darox.example 192.168.1.20 \
  --manager 192.168.1.10:3145
npm run web -- darox.example:8443 192.168.1.20:8443 \
  --manager http://192.168.1.10:3145
```

The script requires one or more hostname or IP address arguments; there is no
default domain. Each address uses port `3143` unless it includes another port.
Caddy also serves HTTP on port `3140` without redirecting to HTTPS. It binds
the requested ports on `0.0.0.0` and uses `tls internal` to issue
a certificate covering every supplied hostname and IP address.
Configure name resolution on each client so every supplied hostname points to this computer's
LAN IP (for example via a hosts entry or an existing local name-resolution setup);
the script does not configure DNS or advertise mDNS. Ensure port 3143 is not
already occupied by a profile or another service.

It forwards `/api/*` unchanged to the Manager selected by `--manager` (default
`127.0.0.1:3145`), including WebSockets, and serves other requests directly from
the static `out/` directory. Set `DAROX_WEB_ROOT` to use another static export
directory. `DAROX_MANAGER_UPSTREAM` sets the default Manager upstream when
`--manager` is omitted. The script does not start Manager; Ctrl+C stops Caddy.
Rebuild the static export after frontend changes. Run the default build separately
from a running Next dev server.

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
The server does not listen on port 80. HTTP traffic, including the Manager token,
is unencrypted; use HTTPS when that matters.

## Verification and packaging

```bash
npm test                  # Manager client/store tests (Node 22.18+)
npx tsc --noEmit
npm run lint
npm run electron:compile
npm run build:check       # Isolated .next-check build, safe alongside npm run web:dev
npm run electron:dir      # Fast unpacked binary build without compression (release/linux-unpacked/darox)
npm run electron:fast-run # Launch unpacked binary
npm run electron:build    # Production static export and desktop package
```

### Desktop packages

```bash
npm ci
npm run electron:dir      # Local testing: builds release/linux-unpacked/ without compression
npm run electron:fast-run # Builds and immediately launches unpacked binary
npm run electron:build    # Production packages (pacman and tar.gz)
```

On Arch, install build prerequisites for pacman packaging with
`sudo pacman -S --needed libxcrypt-compat libarchive xz`. FPM requires the legacy
`libcrypt.so.1` provided by `libxcrypt-compat`.

Desktop builds export to `.next-package/` and copy the verified export to `out/`, leaving the development
`.next/` untouched. Packages are written to `release/`: Linux builds Arch Linux
`pacman` and portable `tar.gz` packages (no deb or AppImage); macOS builds dmg;
Windows builds NSIS. You can also run the unpacked binary directly at
`release/linux-unpacked/darox`. Build and smoke-test on the target platform.
The package includes the client, not Manager. On Arch, install the generated
package with `sudo pacman -U <package>` and launch `darox`. No AUR PKGBUILD is generated.
Signing/notarization credentials are not configured in this repository.

The production `app://` handler adds a per-document CSP with hashes for Next's
inline bootstrap scripts; it does not allow arbitrary inline scripts or eval.

### Production web hosting

```bash
npm run build
npm start
```

`npm start` serves `out/` on `127.0.0.1:3140`; use `PORT` and `HOST` to override.
It requires a prior static build and never starts Manager. Serve the origin root,
not a subpath. Run the default build separately from a running Next dev server;
`build:check` disables static export and does not refresh `out/`.

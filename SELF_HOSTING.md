# Running StackQuest on your own server

StackQuest is a team-learning web app (Python, Linux, JavaScript and networking
missions, leaderboards and team chat). This folder has everything needed to run it
with Docker: the app, a PostgreSQL database and nightly backups. No paid services
or API keys are needed.

## What you need

- A Linux machine (x86-64 or ARM64, e.g. a Raspberry Pi 4/5) with
  [Docker Engine and the Compose plugin](https://docs.docker.com/engine/install/).
  Check with `docker compose version`.
- About **1 GB of RAM** while running and **3 GB free during the first build**
  (the build compiles the app), plus ~2 GB of disk.
- Internet access for the build (it downloads npm packages).
- Learners' browsers also need internet: Python missions download the Python
  runtime (~10 MB, cached) from `cdn.jsdelivr.net`. Learner code always runs in the
  learner's own browser, **never on this server**.

## 1. Decide how people will reach it

Sign-in requires **HTTPS** for anything beyond LAN testing. Pick one:

| Option | Cost | Notes |
| --- | --- | --- |
| **Cloudflare Tunnel** (recommended) | Free, needs a domain on Cloudflare | No router ports opened, home IP stays hidden, HTTPS automatic. Built in: just add a token. |
| **Tailscale Funnel** | Free | Stable `https://<machine>.<tailnet>.ts.net` address, no domain needed. |
| **Caddy + port forwarding** | Free, needs a domain | Caddy gets certificates automatically. Opens ports on the home router. |
| **LAN only** (`http://<server-ip>:3000`) | Free | For trying it out at home. Not for real use. |

## 2. Start it

```bash
unzip stackquest.zip && cd stackquest
./start.sh
```

On first run `start.sh` creates `.env` with a generated database password and asks
for the public address (`APP_URL`), e.g. `https://learn.example.com`. It then builds
the image (a few minutes the first time), starts everything and waits until the
app reports healthy.

### With Cloudflare Tunnel

1. In the Cloudflare dashboard: **Zero Trust → Networks → Tunnels → Create a tunnel →
   Cloudflared**. Choose the **Docker** option and copy the token (the long string
   after `--token`).
2. Put it in `.env`: `CLOUDFLARE_TUNNEL_TOKEN=<token>` and set
   `APP_URL=https://<the hostname you'll use>`.
3. In the tunnel's **Public Hostname** tab, add that hostname with service
   **HTTP** and URL **`app:3000`**.
4. Run `./start.sh` again. It starts the tunnel container too. You can set
   `BIND_ADDRESS=127.0.0.1` in `.env` so the app isn't exposed on the LAN at all.

### With Tailscale Funnel

Set `APP_URL=https://<machine>.<tailnet>.ts.net` and `BIND_ADDRESS=127.0.0.1` in
`.env`, run `./start.sh`, then on the server:

```bash
sudo tailscale funnel --bg 3000
```

### With Caddy

Point your domain's DNS at your home IP, forward ports 80 and 443 to the server,
set `APP_URL=https://<domain>` and `BIND_ADDRESS=127.0.0.1`, and use a Caddyfile:

```
learn.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

## 3. First sign-in

1. Open the address and **create an account**. The first account creates the team
   and becomes its admin.
2. Go to **Admin → Create invitation link** and send links to teammates. Links
   expire and can be single-use. There's no email, so you share them yourself.
3. With `TEAM_CREATION=first-only` (the default), nobody else can create a separate
   team, so strangers who find the site can sign up but can't do anything without an
   invitation. Set `open` if you want anyone to be able to start their own team.

Check health any time: `curl -s http://127.0.0.1:3000/api/health` should return
`{"ok":true,"db":"postgres",...}`.

## Day-to-day

| Task | Command |
| --- | --- |
| See status | `docker compose ps` |
| Logs | `docker compose logs -f app` |
| Stop / start | `docker compose stop` / `docker compose start` |
| Restart after editing `.env` | `./start.sh` |
| Update to a new version | Replace the files with the new zip **keeping `.env` and `backups/`**, then `./start.sh` |
| Restore a backup | `./restore.sh backups/stackquest-<date>.dump` |

**Backups:** a dump is written to `./backups` at start-up and every 24 hours, and the
last 14 days are kept (`BACKUP_KEEP_DAYS`). They're on the same disk as the database,
so copy `./backups` somewhere else now and then.

**Database data** lives in the Docker volume `stackquest_pgdata`. `docker compose down`
keeps it; `docker compose down -v` **deletes it permanently**.

Database migrations run automatically when the app starts, so updates need no
extra steps.

## Settings (`.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_URL` | (asked on first run) | Public address; used for invitation links. `http://` turns off Secure cookies (LAN testing only). |
| `POSTGRES_PASSWORD` | generated | Database password. Only read when the database is first created. |
| `PORT`, `BIND_ADDRESS` | `3000`, `0.0.0.0` | Where the app listens on the host. |
| `TEAM_CREATION` | `first-only` | `first-only` or `open`. |
| `CLOUDFLARE_TUNNEL_TOKEN` | empty | Starts the Cloudflare Tunnel container when set. |
| `BACKUP_KEEP_DAYS` | `14` | Backup retention. |
| `DEMO_MODE` | `false` | Fictional demo team. Keep `false` for real use. |

## Troubleshooting

- **Can't stay signed in:** you're on `http://` while `APP_URL` is `https://`, or the
  other way round. They must match the address in the browser.
- **"Cross-site request blocked":** the proxy is changing the Host header. Cloudflare
  Tunnel, Tailscale and Caddy pass it through by default.
- **Build killed / out of memory:** the first build needs ~3 GB of RAM. Add swap, or
  build on another machine with `docker build -t stackquest:local .`, then
  `docker save stackquest:local | ssh server docker load`, and run
  `docker compose up -d` (without `--build`).
- **Python missions stuck on "Loading Python":** the learner's browser can't reach
  `cdn.jsdelivr.net` (a firewall or ad blocker).
- **Live chat stops updating:** the proxy is buffering streaming responses. The three
  options above don't; for nginx, set `proxy_buffering off;` for `/api/realtime`.

## Good to know

- Python and JavaScript mission checks run in the learner's browser, so a determined
  learner could fake those results. Linux and networking labs and all questions are
  graded on the server. It's built for honest team learning, not exams.
- No email: no password reset by email and no emailed invitations.
- More detail: `README.md`, `docs/TEAM_GUIDE.md` (running a team),
  `docs/ADDING_MISSIONS.md`, `docs/SECURITY.md`, `docs/KNOWN_LIMITATIONS.md`.

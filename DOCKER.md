# Running Pharaoh Slap in Docker

A single container runs everything: the WebSocket game server, the accounts/
progression API, and the static client. SQLite data persists on a volume.

## Quick start (Docker Compose)

```bash
# from this folder
JWT_SECRET=$(openssl rand -hex 32) docker compose up --build
```

Then open http://localhost:8080

## Quick start (plain Docker)

```bash
docker build -t pharaoh-slap .
docker run -d --name pharaoh-slap \
  -p 8080:8080 \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -v pharaoh-data:/data \
  pharaoh-slap
```

Open http://localhost:8080 — WebSocket online play works on the same origin,
so the lobby's server field can be left blank.

## Notes

- **Node 22 / SQLite** — `db.js` uses the built-in `node:sqlite`, so there are no
  native builds and the Alpine image stays small. The entrypoint passes
  `--experimental-sqlite` so the import works across 22.x releases.
- **Persistence** — accounts, stars and progress live in `/data/pharaoh.db` on the
  `pharaoh-data` volume. Remove the volume to reset all accounts.
- **JWT_SECRET** — if you don't set one, the server generates a random secret at
  boot and login tokens stop working after a restart. Always set it in prod.
- **Health** — the container reports healthy via `GET /health`.
- **Port** — override with `-e PORT=...` and the matching `-p` mapping.

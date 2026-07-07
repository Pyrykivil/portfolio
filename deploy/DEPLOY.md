# Deploy runbook: Raspberry Pi self-hosting

Target: 64-bit Raspberry Pi OS (arm64), Docker Engine + compose plugin, no port
forwarding (Cloudflare Tunnel handles ingress). Three services exposed publicly:

| Public hostname | Internal service | Port |
|---|---|---|
| pyrykiviluoma.fi | web | 8641 |
| rag.pyrykiviluoma.fi | rag | 8501 |
| etl.pyrykiviluoma.fi | metabase | 3000 |

All steps below are copy-paste-ready for the Pi's terminal (SSH in first).

## 1. Install Docker on Raspberry Pi OS (64-bit)

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

Log out and back in (or reboot) if `docker compose version` fails to pick up
the group membership.

## 2. Move pyrykiviluoma.fi DNS to Cloudflare (free plan)

1. Sign up / log in at https://dash.cloudflare.com.
2. "Add a site" -> enter `pyrykiviluoma.fi` -> choose the Free plan.
3. Cloudflare scans existing DNS records and shows you the nameservers to use.
4. At your domain registrar, replace the current nameservers with the two
   Cloudflare nameservers shown (e.g. `xxx.ns.cloudflare.com`).
5. Wait for the zone to become "Active" in the Cloudflare dashboard (usually
   minutes to a few hours for nameserver propagation).

## 3. Create a Cloudflare Tunnel with the three public hostnames

1. In the Cloudflare dashboard, go to Zero Trust -> Networks -> Tunnels.
2. Click "Create a tunnel", choose "Cloudflared", name it (e.g. `pi-home`).
3. Copy the tunnel token shown on the install step. This is the value for
   `TUNNEL_TOKEN` in `.env` (step 5). You do not need to run the install
   command Cloudflare shows. the `cloudflared` container in this bundle
   handles that.
4. Under "Public Hostnames", add three entries:
   - Hostname `pyrykiviluoma.fi` -> Service `http://web:8641`
   - Hostname `rag.pyrykiviluoma.fi` -> Service `http://rag:8501`
   - Hostname `etl.pyrykiviluoma.fi` -> Service `http://metabase:3000`
5. Save. Cloudflare automatically creates the CNAME DNS records for these
   hostnames pointing at the tunnel.

## 4. Clone the three repos into ~/apps

```bash
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/Pyrykivil/portfolio.git
git clone https://github.com/Pyrykivil/nhg-rag-demo.git
git clone https://github.com/Pyrykivil/THL-etl.git thl-etl
```

The deploy bundle itself lives inside the portfolio repo at
`~/apps/portfolio/deploy/`. Either work from there directly, or copy that
folder out to `~/apps/deploy/` to match the directory layout referenced by
this runbook and by the relative paths in `docker-compose.yml`
(`../portfolio`, `../nhg-rag-demo`, `../thl-etl`):

```bash
cp -r ~/apps/portfolio/deploy ~/apps/deploy
cd ~/apps/deploy
```

Resulting layout:

```
~/apps/
├── portfolio/
├── nhg-rag-demo/
├── thl-etl/
└── deploy/
    ├── Dockerfile.web
    ├── docker-compose.yml
    ├── .env
    └── check.sh
```

## 5. Fill in .env

```bash
cp .env.example .env
nano .env
```

Set real values for `ADMIN_PASSWORD`, `GROQ_API_KEY`, `TUNNEL_TOKEN`,
`POSTGRES_PASSWORD` (change from the default), and review `POSTGRES_USER` /
`POSTGRES_DB`. See `.env.example` for what each variable is used for.

## 6. Bring the core services up

```bash
docker compose up -d
```

This starts `web`, `rag`, `etl-db`, `metabase`, and `cloudflared`. The two
one-off job services (`rag-ingest`, `etl-pipeline`) are behind the `jobs`
profile and will NOT start with this command.

Check status:

```bash
docker compose ps
docker compose logs -f
```

## 7. Run the one-off jobs

RAG document ingestion (populates the `chroma_data` volume, must run at
least once before the RAG app has anything to answer questions from):

```bash
docker compose --profile jobs run --rm rag-ingest
```

THL ETL pipeline (extract -> transform -> load -> AI anomaly summary,
populates `etl-db`; requires `etl-db` to be healthy, which `depends_on`
enforces):

```bash
docker compose --profile jobs run --rm etl-pipeline
```

Re-run either job any time you want to refresh data. Both are idempotent in
the sense that the underlying scripts TRUNCATE/re-index before writing.

## 8. First-run Metabase setup

1. Visit `http://etl.pyrykiviluoma.fi` (or `http://<pi-ip>:3000` locally
   first, before DNS/tunnel is confirmed working).
2. Metabase's setup wizard asks for an admin account, then a database
   connection. THL ETL data is already reachable: Metabase's own metadata
   database was created automatically inside `etl-db` (via
   `thl-etl/sql/init-db.sh`), and the same Postgres instance holds the
   `analytics.fact_visits`, `raw.visits`, and `analytics.anomaly_log` tables
   once `etl-pipeline` has run.
3. If Metabase does not auto-detect the data source, add a database
   manually: type Postgres, host `etl-db`, port `5432`, database name from
   `POSTGRES_DB` in `.env`, user/password from `POSTGRES_USER` /
   `POSTGRES_PASSWORD`.
4. Optionally run `thl-etl/sql/views.sql` against the database (via
   Metabase's SQL editor, or `docker compose exec etl-db psql -U <user> -d
   <db> -f -` piping the file in) to create the BI-ready views
   (`v_visits_by_chapter`, `v_yoy_change`, `v_top_chapters`) used for
   dashboards.
5. Build dashboards/questions against `analytics.fact_visits` and the views.

## 9. How admin content edits work in production

- The portfolio site is served by `scripts/serve.py` inside the `web`
  container, with the whole `~/apps/portfolio` directory bind-mounted to
  `/app` (see `Dockerfile.web` for why: this makes edits persist across
  container restarts without extra volume plumbing).
- Visit `https://pyrykiviluoma.fi/admin/` to open the admin panel.
- Edits are saved via `POST /api/content`, authenticated with the
  `X-Admin-Key` header, which must match the `ADMIN_PASSWORD` value from
  `.env`. If `ADMIN_PASSWORD` is unset, `serve.py` falls back to a default
  password and prints a warning in its logs. always set a real one.
- On every successful save, `serve.py` copies the current `content.json`
  into `~/apps/portfolio/content.backups/content-<timestamp>.json` before
  overwriting it, so you can recover a previous version by copying a backup
  file back over `content.json` and restarting the `web` container (or just
  waiting. serve.py reads content.json fresh on each request, no restart
  needed, unless the static page caches it client-side).
- Because the bind mount points straight at the git checkout, `content.json`
  edits show up as an uncommitted change in `git status` on the Pi. Decide
  whether you want to periodically commit those changes back or treat
  `content.json` as Pi-local state (add it to `.gitignore` on the Pi checkout
  if you prefer the latter. do not do this in the shared repo unless that is
  the intended policy for all clones).

## 10. Updating the site

```bash
cd ~/apps/portfolio
git pull
cd ~/apps/deploy
docker compose up -d --build web
```

Same pattern for the other two repos (`git pull` in `~/apps/nhg-rag-demo` or
`~/apps/thl-etl`, then `docker compose up -d --build rag` or rebuild and
re-run `etl-pipeline` as needed).

## 11. Realistic Raspberry Pi expectations

- **sentence-transformers first run**: the `nhg-rag-demo` Dockerfile bakes
  the embedding model into the image at build time, so there is no
  first-request download delay at runtime, but the image BUILD itself
  downloads `paraphrase-multilingual-MiniLM-L12-v2` from Hugging Face. this
  needs internet access on first build and can take several minutes on a
  Pi's slower storage/CPU.
- **Embedding speed on ARM**: sentence-transformers on a Pi's ARM CPU
  (no GPU) is meaningfully slower than on a dev laptop. Ingesting a modest
  set of Käypä hoito PDFs is fine but expect noticeably longer ingest times
  than local testing showed; this is a one-off job, so it is a one-time
  cost per data refresh, not a per-query cost.
- **Metabase JVM RAM use**: Metabase runs on the JVM and typically holds
  roughly 1 to 2 GB of RAM at idle-to-light-use. Combined with Postgres,
  the RAG app's embedding model in memory, and the OS itself, a 4 GB Pi can
  get tight. An 8 GB Raspberry Pi 5 (or 4) is recommended for running all
  services at once. If you only have 4 GB, add swap:

  ```bash
  sudo dphys-swapfile swapoff
  sudo sed -i 's/CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
  sudo dphys-swapfile setup
  sudo dphys-swapfile swapon
  ```

- **Skipping Metabase initially**: you do not have to run everything at
  once. Bring up only the services you need right now:

  ```bash
  docker compose up -d web rag
  ```

  Add `etl-db` and `metabase` later once you have confirmed the Pi handles
  the first two comfortably:

  ```bash
  docker compose up -d etl-db metabase
  ```

- **metabase/metabase arm64 image availability**: as of this writing, the
  official `metabase/metabase` image on Docker Hub does not publish a native
  `linux/arm64` build (amd64 only). On a 64-bit Raspberry Pi OS host with
  Docker Engine, this typically still runs via automatic QEMU emulation of
  amd64 images (most current Raspberry Pi OS + Docker installs register
  `binfmt_misc` handlers for this out of the box; if not, install
  `tonistiigi/binfmt` once with
  `docker run --privileged --rm tonistiigi/binfmt --install all`). Emulated
  Metabase works but starts slower and uses more CPU than a native image
  would. If that is too slow on your specific Pi, swap the `metabase` image
  in `docker-compose.yml` for a community-maintained arm64 build (search
  Docker Hub for `metabase-arm64` forks) and re-run
  `docker compose up -d metabase`. verify whichever tag you pick still works
  with the same `MB_DB_*` environment variables before relying on it.

# Deploying Skill Nexus Hub on Ubuntu (intranet, IP + port)

This guide deploys Skill Nexus Hub on an Ubuntu server inside an intranet, without a domain
name. The stack is accessed directly via server IP and port:

```text
http://<SERVER-IP>:9527
```

Replace `<SERVER-IP>` (and `<user>`) with your real values throughout this document.

> Production note: always set a strong `DB_PASSWORD` and `SECRET_KEY` in `.env`. If you put the
> stack behind a reverse proxy (nginx, Caddy, Traefik…), also set `TRUSTED_PROXIES` to the proxy
> IP list so rate limiting sees real client IPs, and make sure `CORS_ORIGINS` contains the
> origin users actually visit.

## 1. Package the code

From your local clone of `https://github.com/Soonkeira/skill-nexus-hub` (or any commit you want to
ship), build a source tarball with `git archive` — it contains only tracked files, so `.env`,
`.git`, `node_modules`, build caches and local runtime data are never included:

```bash
git archive -o skill-nexus-hub.tar.gz --prefix=skill-nexus-hub/ HEAD
```

## 2. Upload to the server

```bash
scp skill-nexus-hub.tar.gz <user>@<SERVER-IP>:/opt/
```

## 3. Install server dependencies

SSH into the server and run:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin openssl
sudo systemctl enable --now docker
```

Confirm Docker is usable:

```bash
docker --version
docker compose version
```

## 4. Open the port

If `ufw` is enabled:

```bash
sudo ufw allow 9527/tcp
sudo ufw status
```

On a cloud VM, also allow TCP 9527 in the provider's security-group console.

## 5. Extract the package

```bash
cd /opt
tar -xzf skill-nexus-hub.tar.gz
cd /opt/skill-nexus-hub
```

The tarball contains a `skill-nexus-hub/` top-level directory (the `--prefix=` above), so no
directory needs to be created manually.

## 6. Create the production environment file

Still in `/opt/skill-nexus-hub`:

```bash
DB_PASSWORD=$(openssl rand -base64 32)
SECRET_KEY=$(openssl rand -hex 64)

cat > .env <<EOF
DB_PASSWORD=$DB_PASSWORD
SECRET_KEY=$SECRET_KEY
ENV=production
CORS_ORIGINS=http://<SERVER-IP>:9527
TRUSTED_PROXIES=
EOF
```

Then check `.env` and replace `<SERVER-IP>` in the `CORS_ORIGINS` line with the real IP, e.g.:

```env
CORS_ORIGINS=http://123.123.123.123:9527
```

Do not reuse your local development `.env`. Production must use a strong `DB_PASSWORD` and a
strong `SECRET_KEY`. If the stack sits behind a reverse proxy, fill `TRUSTED_PROXIES` with the
proxy IP addresses (comma-separated).

## 7. Build the images

```bash
docker compose build
```

The build downloads Python and Node dependencies; on a slow server connection this can take a
while. Old containers keep running while you rebuild.

## 8. Run database migrations — before starting services

For a first deployment and after every code update, run migrations **before** (re)starting the
services:

```bash
docker compose run --rm backend alembic upgrade head
```

The schema is managed by Alembic; migrations do not wipe existing users, skills, comments or
uploaded files.

Confirm the revision:

```bash
docker compose run --rm backend alembic current
```

The output should be the head revision (it matches the newest file in
`backend/alembic/versions/`).

## 9. Start the services

```bash
docker compose up -d
docker compose ps
```

`postgres`, `backend` and `frontend` should all be running.

## 10. Verify

On the server:

```bash
curl http://<SERVER-IP>:9527/api/health
```

Expected:

```json
{"status":"ok"}
```

Open `http://<SERVER-IP>:9527` in a browser. You can also verify per-Agent install-target
filtering (different targets should return different skills):

```bash
curl 'http://<SERVER-IP>:9527/api/skills?target=cursor'
curl 'http://<SERVER-IP>:9527/api/skills?target=openclaw'
```

## 11. Create the first admin

Option A — use the backend superuser script (creates a user with the admin role directly):

```bash
docker compose run --rm backend python -m app.cli
```

It prompts for a username and password.

Option B — register an account on the site first, then promote it with SQL:

```bash
docker compose exec postgres psql -U skillhub -d skill_nexus_hub \
  -c "UPDATE users SET role='admin' WHERE username='<USERNAME>';"
```

Log in again with that account afterwards.

## 12. Common operations

```bash
docker compose ps                     # container status
docker compose logs -f backend        # backend logs
docker compose logs -f frontend       # frontend logs
docker compose restart                # restart all services
docker compose down                   # stop everything
```

Update to a new release: build the tarball (step 1), upload and extract over `/opt/skill-nexus-hub`
(or `git pull` if you cloned the repo), then:

```bash
cd /opt/skill-nexus-hub
docker compose build
docker compose run --rm backend alembic upgrade head   # migrations BEFORE restart
docker compose up -d
```

## 13. Backup and restore

Backups (database dump + uploaded skill files, kept for 30 days):

```bash
cd /opt/skill-nexus-hub
bash scripts/backup.sh
```

Restore a backup (interactive confirmation; replaces the current database and `data/skills`):

```bash
bash scripts/restore.sh <backup-directory-name>   # e.g. 2026-06-16_085124
```

Schedule a daily 02:00 backup cron job:

```bash
bash scripts/setup-cron.sh
```

Keep off-machine copies of everything under `data/backups/`.

## 14. Post-deployment checklist

```text
[ ] http://<SERVER-IP>:9527 opens
[ ] /api/health returns {"status":"ok"}
[ ] Registration and login work
[ ] An admin account exists
[ ] The skill marketplace loads
[ ] Install-target filtering returns target-specific skills
[ ] Skill detail pages render their README
[ ] A skill can be published and installed
[ ] The CLI download endpoint serves a binary
[ ] Port 9527 is reachable (ufw / security group)
[ ] Production .env uses strong DB_PASSWORD and SECRET_KEY (no defaults)
[ ] A backup routine exists for the database and data/skills
```

# Agent Notes

## Working Principles

- Start from the actual user goal and the root problem, not from a template.
- If the goal is unclear, stop and clarify before changing code.
- If there is a shorter or safer path, say so directly and use it.
- Fix root causes; do not hide symptoms with local patches.
- Keep updates decision-relevant.

## Production Deployment

Production is the Aliyun host `101.132.96.101`.

- SSH: `ssh -i ~/Downloads/lolking.pem root@101.132.96.101`
- App path: `/srv/lol-system`
- PM2 app: `lol-system`
- App port: `3000`
- Database: local PostgreSQL 16, database `lol_system`
- Backups: `/root/db-backups/`

Before deployment, confirm the target is correct:

```bash
ssh -i ~/Downloads/lolking.pem root@101.132.96.101
cd /srv/lol-system
hostname
git status -sb
git remote -v
pm2 list
```

Typical deployment flow:

```bash
cd /srv/lol-system
sudo -u postgres pg_dump lol_system | gzip > /root/db-backups/lol_system_pre_deploy_$(date +%Y%m%d_%H%M%S).sql.gz
git fetch origin
git reset --hard origin/main
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
pm2 restart lol-system
```

Smoke checks after restart:

```bash
curl -sS -I http://127.0.0.1:3000/
curl -sS http://127.0.0.1:3000/api/tournament/public/state
pm2 list
```

Notes:

- Do not deploy to a guessed server. If this host is inaccessible, ask in the Lark thread or check Claude project memory before mutating anything.
- The server has previously had branch drift. Treat `/srv/lol-system` as the production working tree and verify `git status -sb` before reset.
- GitHub access from the server can be unstable. If fetch fails, push from local over SSH to the server and then reset on the server.
- For destructive DB resets, PostgreSQL `public` schema ownership must be restored to the app user after recreating the DB:

```bash
sudo -u postgres psql -c 'ALTER DATABASE lol_system OWNER TO "lol";'
sudo -u postgres psql lol_system -c 'GRANT ALL ON SCHEMA public TO "lol"; ALTER SCHEMA public OWNER TO "lol";'
```

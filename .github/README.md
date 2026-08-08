# CI/CD

Modelled on the doazores reference project.

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | `workflow_call` only | typecheck · lint · test · build, in parallel |
| `pr.yml` | PR into `dev`/`qa`/`main` | runs CI |
| `cd.yml` | push to `dev`/`qa`/`main` | CI → migrate → blue-green deploy → tripwire |

Branch → stage: `dev` → dev, `qa` → qa, `main` → prod. The promotion path is
`dev → qa → main`.

## The deploy gate

**Deploys are off until you turn them on.** `cd.yml`'s migrate/deploy/flip/
tripwire jobs run only when the repository variable `DEPLOY_ENABLED` is exactly
`true`. CI runs on every push regardless.

The gate exists because Ntizo's Cloudflare side is not provisioned yet — most
importantly, **a deployed Worker cannot reach Postgres without a Hyperdrive
binding**. `postgres.js` opens raw TCP sockets, which work under local
`wrangler dev` but not from a deployed Worker. Without the gate, every push to
`dev` would fail at the first deploy job, and a permanently red pipeline is one
nobody reads.

Turn it on with:

```bash
gh variable set DEPLOY_ENABLED --body true
```

## Provisioning checklist — complete before enabling

1. **Hyperdrive, one per stage.** Nothing else matters until this is done.

   ```bash
   wrangler hyperdrive create ntizo-db-dev --connection-string="<neon url>"
   ```

   Add the returned id under that stage in
   `apps/backend/api/wrangler.jsonc`:

   ```jsonc
   "dev": {
     "vars": { "STAGE": "dev", "LOG_LEVEL": "info" },
     "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<id>" }]
   }
   ```

   The code already prefers it: `infraStore.getConnectionString()` returns the
   Hyperdrive string when the binding is present and falls back to
   `DATABASE_URL` otherwise. No code change needed.

2. **Routes on the api worker.** `apps/backend/api/wrangler.jsonc` currently
   declares no `routes`, so there is no custom domain to flip traffic to and the
   tripwire has nothing to curl. Add per stage:

   ```jsonc
   "routes": [{ "pattern": "dev.api.ntizo.com", "custom_domain": true }]
   ```

3. **Confirm the web hostnames.** `apps/frontend/web/wrangler.jsonc` carries a
   comment saying `dev.ntizo.com` / `qa.ntizo.com` / `ntizo.com` are
   placeholders. Verify the zones exist on Cloudflare before the first deploy.

4. **First flip is manual, per stage.** Blue-green (`versions upload` →
   `versions deploy @100%`) shifts traffic on a worker that already owns its
   custom domain. It cannot attach one. Run a plain `wrangler deploy --env
   <stage>` once per worker per stage first; CD handles every deploy after that.

5. **Enable preview URLs** on both workers, or `versions upload` produces no
   preview URL and the deploy job fails by design rather than skipping its smoke
   test. The web worker already sets `"preview_urls": true`; the api worker does
   not.

## Secrets

| Secret | Used by | Notes |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | all deploy jobs | Workers Scripts: Edit |
| `CLOUDFLARE_ACCOUNT_ID` | all deploy jobs | |
| `DEV_DB_URL` | migrate (dev) | Neon connection string |
| `QA_DB_URL` | migrate (qa) | |
| `PROD_DB_URL` | migrate (prod) | |

Worker runtime secrets are **not** set by CD — provision them once per stage:

```bash
wrangler secret put DATABASE_URL        --env dev
wrangler secret put BETTER_AUTH_SECRET  --env dev
wrangler secret put RESEND_API_KEY      --env dev
```

`RESEND_API_KEY` is required in every non-local stage: `bootstrap.ts` throws at
send time without it, deliberately, because the alternative is silently dropping
every verification email.

## Two things CD does not do

**It does not roll back migrations.** The tripwire reverts Workers only. After
an auto-revert the previous Worker runs against the migrated schema — verify it
tolerates that before re-deploying. Keep migrations backward-compatible with the
version before them.

**It does not run browser E2E.** The tripwire is an HTTP smoke: the API returns
`{"status":"ok"}` and the web root serves HTML containing a `<script>`. That
catches a broken deploy, not a broken feature.

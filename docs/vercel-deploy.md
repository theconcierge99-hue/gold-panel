# Vercel deploy stuck on old commit?

If **GitHub `main` is ahead** but Vercel Production still shows **`1e03d96`**, Git auto-deploy is disconnected.

**Important:** A manual redeploy of **`1e03d96`** does **not** include Phantom NFT mint (`2e0840b+`). Always deploy the **latest commit on `main`** (check `public/deploy-version.txt` after deploy).

## Quick fix (no code)

1. Open [Vercel → lounge → Deployments](https://vercel.com).
2. Click **Create Deployment** (top right).
3. Choose branch **`main`** from the dropdown (do **not** paste a GitHub URL in the text field).
4. Select the latest commit (e.g. `0d6cd42`).
5. Environment: **Production** → **Deploy**.

**Hobby plan:** function memory must stay ≤ 2048 MB (this repo no longer sets 3008 MB in `vercel.json`).

After **Ready**, hard-refresh https://conc-exe.xyz and check  
https://conc-exe.xyz/deploy-version.txt — it should match the new commit.

## Reconnect GitHub

1. **Project → Settings → Git**
2. Confirm repository: `theconcierge99-hue/gold-panel`
3. Production branch: **main**
4. If wrong or missing: **Disconnect** → **Connect Git Repository** again.

## Deploy Hook (auto deploy on every push)

1. **Project → Settings → Git → Deploy Hooks**
2. Create hook: name `github-main`, branch **main**
3. Copy the hook URL.
4. GitHub repo → **Settings → Secrets and variables → Actions**
5. New secret: `VERCEL_DEPLOY_HOOK` = paste URL
6. Push to `main` — workflow `.github/workflows/trigger-vercel-deploy.yml` will POST the hook.

## Verify live version

```text
GET https://conc-exe.xyz/deploy-version.txt
```

Should show the same short hash as the latest Production deployment in Vercel.

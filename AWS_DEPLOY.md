# AWS Deployment Guide

A step-by-step guide for deploying the Superteam MY Telegram bot to AWS. Written so an AI assistant (e.g. Claude Code) can walk a human owner through it from a fresh AWS account.

> **Audience note for the assistant:** You will NOT have AWS console/CLI access. Your job is to give the human owner exact instructions to follow, then validate each step's output before moving on. Stop and ask for screenshots or copy-pasted output whenever the user reports something unexpected.

---

## Architecture chosen

- **Single EC2 instance** running `docker compose` with both the bot and PostgreSQL containers.
- Region: **`ap-southeast-1` (Singapore)** — lowest latency for SG/MY users. `ap-southeast-5` (Malaysia) is also fine.
- Instance type: **`t3.small`** (2 vCPU, 2 GB RAM) — comfortably handles bot + Postgres for a community-sized group.
- Storage: **20 GB gp3 EBS** root volume, snapshotted weekly.
- Networking: outbound-only — no inbound ports except SSH (22). Telegram uses long-polling, so the bot opens connections out; nothing connects in.

**Why this shape:** Telegram's long-polling API allows only one active connection per bot token. Running multiple instances causes `409 Conflict` errors, so horizontal scaling is off the table. A single small VM with compose is the simplest viable production setup. See `DEPLOY.md` for the constraint.

**Estimated cost:** ~$15–20/month (EC2 + EBS + snapshots + data transfer). Free tier covers most of this for the first 12 months if the account is new.

If the user later wants managed Postgres, the upgrade path is RDS + drop the `db` service from compose — covered at the end of this doc.

---

## Phase 0 — Prep before touching AWS

Confirm with the user before proceeding:

- [ ] A credit/debit card for AWS billing.
- [ ] A phone number for verification.
- [ ] A dedicated email for the AWS root account (e.g. `aws@yourdomain.com`, not a personal Gmail). Keeps billing/recovery separate from daily mail.
- [ ] An SSH key on their local machine. Check with `ls ~/.ssh/id_ed25519.pub` or `ls ~/.ssh/id_rsa.pub`. If neither exists, run:
  ```bash
  ssh-keygen -t ed25519 -C "aws-stmy-bot"
  ```
  Accept defaults, set a passphrase.
- [ ] All `.env` values ready (full list in `README.md`). At minimum: `BOT_TOKEN`, `MAIN_GROUP_ID`. Optional but typically set: `OPENAI_API_KEY`, `PIC_HANDLES`, `INTRO_TOPIC_ID`, `WELCOME_TOPIC_ID`, `REPORT_TOPIC_ID`, `ADMIN_TOPIC_ID`.
- [ ] Confirm `docker compose up -d --build` works cleanly on their laptop end-to-end before deploying. Don't debug on AWS what you can debug locally.
- [ ] Tag a known-good revision: `git tag v1.0.0 && git push --tags` (optional but recommended).

---

## Phase 1 — Create the AWS account

The human owner does this; the assistant cannot.

1. Go to https://aws.amazon.com/ and click **Create an AWS Account**.
2. Use the dedicated email from Phase 0. Choose a strong root password.
3. Account type: **Personal**.
4. Enter address, card, and phone verification.
5. Support plan: **Basic Support (free)**.
6. After signup completes, sign in as the root user.

### Immediately harden the account

These four steps are non-negotiable. Do them before anything else.

1. **Enable MFA on the root user.**
   - Top-right account name → **Security credentials** → **Multi-factor authentication (MFA)** → **Assign MFA device**.
   - Use an authenticator app (Google Authenticator, 1Password, Authy).

2. **Create an IAM user for daily use.**
   - Console search → **IAM** → **Users** → **Create user**.
   - Username: e.g. `admin-<yourname>`. Check **Provide user access to the AWS Management Console**.
   - **Attach policies directly** → select **`AdministratorAccess`**.
   - After creation, also generate an **access key** under the user → **Security credentials** → **Create access key** → **Command Line Interface (CLI)**. Save the Access Key ID and Secret Access Key in a password manager. These are used for the AWS CLI in Phase 2.
   - Sign out of root. Sign in as this IAM user from now on. Enable MFA for this user too.

3. **Set a billing alarm.**
   - Console search → **Billing** → **Billing preferences** → enable **Receive Free Tier Usage Alerts** and **Receive Billing Alerts**.
   - Console search → **CloudWatch** → (switch region to **`us-east-1`** — billing metrics only exist there) → **Alarms** → **Create alarm** → **Select metric** → **Billing** → **Total Estimated Charge** → set threshold at e.g. **$25 USD**. Set notification to an SNS topic with the owner's email.

4. **Pick the working region.** Top-right region selector → **Asia Pacific (Singapore) ap-southeast-1**. Set it now and stay in it; resources are region-scoped.

### Confirm with assistant

Have the user paste:
- The IAM user ARN (visible on the IAM user's summary page; format: `arn:aws:iam::123456789012:user/admin-...`).
- Confirmation that MFA is enabled on root AND on the IAM user.
- Confirmation that the billing alarm shows **OK** status.

Don't proceed until all three are confirmed.

---

## Phase 2 — Install and configure the AWS CLI (optional but recommended)

The CLI lets the assistant give copy-paste commands instead of walking through console clicks for every step. If the user prefers console-only, skip this phase.

1. Install:
   - macOS: `brew install awscli`
   - Linux: `sudo apt install awscli` or the bundled installer from AWS docs.
2. Configure:
   ```bash
   aws configure
   ```
   - **AWS Access Key ID:** from the IAM user
   - **AWS Secret Access Key:** from the IAM user
   - **Default region name:** `ap-southeast-1`
   - **Default output format:** `json`
3. Verify:
   ```bash
   aws sts get-caller-identity
   ```
   Expected output: a JSON object with `UserId`, `Account`, and `Arn` matching the IAM user. If this errors, fix before continuing.

---

## Phase 3 — Launch the EC2 instance

### 3a. Upload SSH key to EC2

1. EC2 console → **Key Pairs** (left sidebar, under Network & Security) → **Actions** → **Import key pair**.
2. Name it `stmy-bot-key`.
3. Paste the contents of `~/.ssh/id_ed25519.pub` (or `id_rsa.pub`).
4. Import.

### 3b. Create a security group

1. EC2 console → **Security Groups** → **Create security group**.
2. Name: `stmy-bot-sg`. Description: `Telegram bot — SSH only`.
3. VPC: leave as default.
4. **Inbound rules:**
   - Type: **SSH**, Port: **22**, Source: **My IP** (autodetects the user's current public IP). If the user has a dynamic IP at home, they may need to update this later when their IP changes — note this.
5. **Outbound rules:** leave the default (all traffic allowed).
6. Create.

### 3c. Launch the instance

1. EC2 console → **Instances** → **Launch instances**.
2. Name: `stmy-bot-prod`.
3. AMI: **Amazon Linux 2023** (the default; should be marked Free tier eligible for `t3.micro` but we're using `t3.small`).
4. Instance type: **`t3.small`**.
5. Key pair: **`stmy-bot-key`** (from 3a).
6. Network settings → **Edit** → **Select existing security group** → choose **`stmy-bot-sg`** (from 3b).
7. Storage: **20 GiB**, **gp3** (change from the default 8 GiB).
8. **Advanced details** → scroll to **User data** → paste:
   ```bash
   #!/bin/bash
   dnf update -y
   dnf install -y docker git
   systemctl enable --now docker
   usermod -aG docker ec2-user
   # Install docker compose plugin
   mkdir -p /usr/local/lib/docker/cli-plugins
   curl -SL https://github.com/docker/compose/releases/download/v2.27.0/docker-compose-linux-x86_64 \
     -o /usr/local/lib/docker/cli-plugins/docker-compose
   chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
   ```
   This bootstraps Docker + compose on first boot. Wait ~2 minutes after launch for it to finish.
9. **Launch instance**.

### 3d. Confirm

Have the user paste:
- The instance ID (format `i-0abc...`).
- The public IPv4 address (visible on the instance details page).
- Output of `ssh -i ~/.ssh/id_ed25519 ec2-user@<PUBLIC_IP>` — they should land at a shell prompt with `[ec2-user@ip-... ~]$`.

If SSH fails, common causes: security group source IP is wrong; key pair was generated from the wrong public key; instance still booting (wait 60s).

---

## Phase 4 — Deploy the bot

All commands below run on the EC2 instance via SSH.

### 4a. Verify Docker is ready

```bash
docker --version
docker compose version
```

Both should print versions. If `docker compose version` errors, the user-data script hasn't finished — wait another minute and retry. If `docker` errors with permission denied, log out and back in (the `usermod -aG docker` from user-data needs a new shell).

### 4b. Clone the repo

```bash
git clone https://github.com/SohZHong/stmy-telegram-bot.git
cd stmy-telegram-bot
```

(Substitute the actual repo URL if the fork differs.)

### 4c. Create the `.env` file

```bash
nano .env
```

Paste the full env contents (the user prepared these in Phase 0). Save with `Ctrl+O`, `Enter`, then `Ctrl+X`.

**Do not commit this file** — it's already in `.gitignore`. The assistant should remind the user.

### 4d. Build and start

```bash
docker compose up -d --build
```

First build takes 3–5 minutes (downloads Node + Postgres images, compiles TS). Subsequent rebuilds are faster.

### 4e. Verify

```bash
docker compose ps
```

Both `bot` and `db` should show status `Up` (or `Up (healthy)` for `db`).

```bash
docker compose logs --tail=50 bot
```

Look for:
- Migration output (e.g. `Migrating files:` or `No migrations to run`).
- A startup line indicating the bot is listening (e.g. polling started).
- No stack traces.

Then send a message to the bot in Telegram (DM `/start` to the bot or trigger any group event) and confirm a response. **This is the real test — the logs only tell you it booted, not that Telegram is reachable.**

---

## Phase 5 — Operations

### Updating after code changes

On the instance:
```bash
cd ~/stmy-telegram-bot
git pull
docker compose up -d --build bot
```

Migrations run automatically on bot startup. Already-applied migrations are skipped.

### Viewing logs

```bash
docker compose logs -f bot          # follow live
docker compose logs --tail=200 bot  # last 200 lines
```

### Restarting

```bash
docker compose restart bot
```

The bot handles `SIGTERM` cleanly — closes the DB pool and stops polling.

### Backups

The Postgres data lives in a Docker volume on the EBS disk. Two options:

**Option A — EBS snapshots (simpler).**
1. EC2 console → **Elastic Block Store** → **Lifecycle Manager** → **Create lifecycle policy**.
2. Policy type: **EBS snapshot policy**.
3. Target: tag-based, e.g. `Name=stmy-bot-prod`.
4. Schedule: daily, retain 7. Optional weekly, retain 4.
5. The instance's root volume is automatically tagged with the instance name.

**Option B — `pg_dump` to S3.** More work, but smaller and portable. Skip unless the user asks.

### Stopping (without losing data)

```bash
docker compose stop
```

To remove containers (data preserved in the volume):
```bash
docker compose down
```

**Never** run `docker compose down -v` in production — the `-v` flag deletes the Postgres volume and all data.

---

## Phase 6 — Hardening (do these within the first week)

1. **Disable password SSH login** (key-only is already the default on Amazon Linux 2023, but verify):
   ```bash
   sudo grep PasswordAuthentication /etc/ssh/sshd_config
   ```
   Should be `PasswordAuthentication no`.

2. **Auto-restart on reboot.** Compose already handles this if the user adds `restart: unless-stopped` to both services in `docker-compose.yml`. Currently the repo's compose file does not set this — recommend adding it:
   ```yaml
   services:
     db:
       restart: unless-stopped
       # ...
     bot:
       restart: unless-stopped
       # ...
   ```

3. **CloudWatch agent for logs (optional).** Streams `docker compose logs` to CloudWatch so logs survive instance termination. Skip unless the user wants centralized logs.

4. **Elastic IP.** If the instance is ever stopped/started, its public IP changes. Allocate an Elastic IP and associate it so SSH access stays stable. EC2 console → **Elastic IPs** → **Allocate** → **Associate** with the instance. Free while attached to a running instance.

5. **Lock down SSH source.** Once the user has a stable working IP, narrow the security group rule from `My IP` (which they may have set to a dynamic home IP) to a known-static IP, VPN gateway, or a bastion. If neither is available, this is acceptable as-is but document the trade-off.

---

## Upgrade path: managed Postgres (RDS)

When/if data durability becomes a priority, move Postgres off the EC2 instance:

1. Create an RDS PostgreSQL 16 instance, `db.t4g.micro`, single-AZ, 20 GB gp3, in the **same VPC** as the EC2 instance.
2. Security group: allow inbound 5432 **only from the EC2 instance's security group** (not 0.0.0.0/0).
3. Dump existing data from the compose Postgres:
   ```bash
   docker compose exec db pg_dump -U bot stmy_bot > backup.sql
   ```
4. Restore into RDS:
   ```bash
   psql "postgresql://bot:<password>@<rds-endpoint>:5432/stmy_bot" < backup.sql
   ```
5. Edit `docker-compose.yml`: remove the `db` service entirely; remove the `depends_on` block from `bot`; remove the `DATABASE_URL` override under `environment`.
6. Update `.env` so `DATABASE_URL` points to RDS.
7. `docker compose up -d` — bot now talks to RDS.

Adds ~$13/month for the RDS instance. Gains: automated backups, point-in-time recovery, no risk of EBS corruption taking down the DB.

---

## Phase 7 — CI/CD via GitHub Actions

The repo includes `.github/workflows/deploy.yml`, which SSHs into the EC2 instance and runs `docker compose up -d --build bot` whenever `main` is updated. All env values are read from GitHub Actions secrets — nothing sensitive lives in the repo.

### 7a. Create a dedicated deploy SSH key

Don't reuse the user's personal SSH key for CI. Create one just for GitHub Actions, on the **EC2 instance**:

```bash
# On the EC2 instance:
ssh-keygen -t ed25519 -f ~/.ssh/github-deploy -N "" -C "github-actions"
cat ~/.ssh/github-deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/github-deploy   # private key — copy this for the SSH_PRIVATE_KEY secret
rm ~/.ssh/github-deploy ~/.ssh/github-deploy.pub   # don't leave the key on the box
```

The private key is now only in two places: the operator's terminal buffer (clear it) and (after Phase 7c) GitHub's encrypted secret store.

### 7b. Open EC2's security group to GitHub Actions

GitHub Actions runners use a published IP range; opening port 22 to that range is wide. Two practical options:

- **Easier, less safe:** temporarily allow `0.0.0.0/0` on port 22 during deploys, revert after. Not recommended for steady state.
- **Recommended:** install [Tailscale](https://tailscale.com/) on the EC2 instance and on the GitHub runner (via the [tailscale-action](https://github.com/tailscale/github-action)), then SSH over the tailnet. No public SSH exposure.
- **Acceptable middle ground:** keep `My IP` for human SSH and add a second inbound rule for the [GitHub Actions IP range](https://api.github.com/meta) (the `actions` array). Note that this list changes — needs occasional review.

For a first pass, the middle ground is fine. Document which approach was chosen in your runbook.

### 7c. Set GitHub repo secrets

Run these locally (in this repo). Each command prompts for the value, so nothing sensitive ends up in shell history:

| Secret | Required | What goes in |
|--------|----------|--------------|
| `SSH_HOST` | Yes | EC2 public IP or Elastic IP (or Tailscale hostname) |
| `SSH_USER` | Yes | `ec2-user` |
| `SSH_PRIVATE_KEY` | Yes | Contents of the `~/.ssh/github-deploy` private key from 7a (include the `-----BEGIN…` and `-----END…` lines) |
| `SSH_PORT` | No | Defaults to `22`; set only if changed |
| `BOT_TOKEN` | Yes | Telegram bot token |
| `MAIN_GROUP_ID` | Yes | Main supergroup chat ID |
| `INTRO_TOPIC_ID` | Yes | Intro topic thread ID |
| `WELCOME_TOPIC_ID` | Yes | Welcome topic thread ID |
| `ADMIN_TOPIC_ID` | No | Admin topic thread ID, if used |
| `ANNOUNCEMENTS_TOPIC_ID` | No | Announcements topic thread ID, if used |
| `OPENAI_API_KEY` | No | OpenAI key for AI features |
| `PIC_HANDLES` | No | Comma-separated handles for contact auto-reply |

Setting them with `gh`:

```bash
# Required
gh secret set SSH_HOST
gh secret set SSH_USER         # ec2-user
gh secret set SSH_PRIVATE_KEY < ~/path/to/github-deploy   # read from file to avoid TTY echo
gh secret set BOT_TOKEN
gh secret set MAIN_GROUP_ID
gh secret set INTRO_TOPIC_ID
gh secret set WELCOME_TOPIC_ID

# Optional — set only if used
gh secret set ADMIN_TOPIC_ID
gh secret set ANNOUNCEMENTS_TOPIC_ID
gh secret set OPENAI_API_KEY
gh secret set PIC_HANDLES
gh secret set SSH_PORT
```

Confirm they're all set:

```bash
gh secret list
```

> **DATABASE_URL is not a secret.** It's overridden inside `docker-compose.yml` to point at the `db` container. If you later migrate to RDS, add `DATABASE_URL` as a secret and reference it in the workflow.

### 7d. How the workflow works

On every push to `main` (or via "Run workflow" on the Actions tab):

1. GitHub Actions runner SSHs into the EC2 instance using `SSH_PRIVATE_KEY`.
2. `git fetch origin main && git reset --hard origin/main` — pulls the latest code. Untracked files (like `.env`) are preserved.
3. Writes a fresh `.env` on the instance from the secrets passed through the SSH session (umask 077, so it's owner-readable only).
4. `docker compose up -d --build bot` — rebuilds and restarts only the bot container. `db` keeps running with its volume intact.
5. Verifies the bot container is `Up` after 5 seconds. Dumps logs and fails the job if not.
6. `docker image prune -f` — cleans up dangling layers from the build.

The `concurrency: deploy-ec2` group prevents overlapping deploys if you push twice in quick succession.

### 7e. First-time verification

After setting the secrets, trigger a manual run:

```bash
gh workflow run deploy.yml
gh run watch
```

If it fails on SSH, the most common causes are:
- Security group not allowing the runner's IP — see 7b.
- `SSH_PRIVATE_KEY` was pasted with a missing trailing newline. Re-set it via file: `gh secret set SSH_PRIVATE_KEY < ~/keyfile`.
- `SSH_HOST` points at the wrong IP after an instance restart — switch to an Elastic IP (Phase 6 step 4).

### 7f. Rotating the deploy key

Every 6–12 months, rotate:

```bash
# On EC2:
ssh-keygen -t ed25519 -f ~/.ssh/github-deploy-new -N "" -C "github-actions"
cat ~/.ssh/github-deploy-new.pub >> ~/.ssh/authorized_keys
# Remove the old public key line from authorized_keys
nano ~/.ssh/authorized_keys
# Update the GitHub secret:
gh secret set SSH_PRIVATE_KEY < ~/.ssh/github-deploy-new
# Clean up:
rm ~/.ssh/github-deploy-new ~/.ssh/github-deploy-new.pub
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `409 Conflict: terminated by other getUpdates request` | Another instance is running with the same bot token (local dev? old EC2?) | Stop the other instance. Only one process per token. |
| Bot logs show DB connection refused | Postgres not healthy yet, or `DATABASE_URL` misconfigured | `docker compose logs db`; wait for healthcheck; verify compose override env. |
| `permission denied` on `docker` commands | User not in `docker` group, or shell session predates `usermod` | `exit` and SSH back in. |
| SSH times out after IP change | Home/office IP changed; security group rule stale | EC2 console → security group → edit inbound rule → update source IP. |
| Out of disk space | Postgres growth or Docker image layers | `docker system prune -a` (safe, keeps volumes); then expand EBS volume if needed. |
| Instance unreachable after reboot | No Elastic IP — public IP changed | Get the new IP from EC2 console; consider Phase 6 step 4. |

---

## Quick reference

| Resource | Value |
|----------|-------|
| Region | `ap-southeast-1` |
| Instance type | `t3.small` |
| AMI | Amazon Linux 2023 |
| Storage | 20 GB gp3 |
| Inbound ports | 22 (SSH) only |
| SSH user | `ec2-user` |
| Repo path on instance | `~/stmy-telegram-bot` |
| Bot logs | `docker compose logs -f bot` |
| Restart | `docker compose restart bot` |
| Update (manual) | `git pull && docker compose up -d --build bot` |
| Update (CI) | Push to `main` — GitHub Actions deploys automatically (see Phase 7) |

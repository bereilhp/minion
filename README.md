# minion
Self-hosted relay for OpenAI Codex via [ananajs](https://www.npmjs.com/package/ananajs).

## Prereqs
- Node 24+
- `codex` authenticated: `codex login`

## Run
```bash
git clone https://github.com/bereilhp/minion && cd minion
npm install            # installs ananajs locally — required
npm start                  # → http://0.0.0.0:3000
```

## API

**GET /health**
```bash
curl http://localhost:3000/health
```

**POST /exec**
```bash
curl -X POST http://localhost:3000/exec \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"explain this repo"}'
```

Body:

```json
{
  "prompt": "what does this repo do?",
  "workdir": "/tmp/my-project",
  "model": "gpt-5.6-luna",
  "effort": "medium",
  "sandbox": "workspace-write",
  "approval": "never",
  "timeoutMs": 300000,
  "json": false
}
```
Only `prompt` is required.

Defaults (`exec/route.js:14`):

| Key | Default when omitted | Notes |
|---|---|---|
| `prompt` | — (required, `400` if missing) | `>8000` chars sent via stdin |
| `workdir` / `cwd` | `process.cwd()` (where you ran `anana`) | Passed as `-C` only if set |
| `model` | `gpt-5.6-luna` (`-m`) |  |
| `effort` | `medium` (`-c model_reasoning_effort`) | `low` / `medium` / `high` / `xhigh` |
| `sandbox` | not sent → Codex default `read-only` | `-s`: `read-only` / `workspace-write` / `danger-full-access` |
| `approval` | not sent → Codex default `never` | `-a`: `never` (auto-run) / `on-request` (model asks) |
| `timeoutMs` | `600000` (10 min) |  |
| `json` | `false` | `true` adds `--json` (JSONL events) |

Full machine access (dangerous — whole FS, no sandbox):

```json
{
  "prompt": "list all projects in ~",
  "workdir": "/",
  "sandbox": "danger-full-access",
  "approval": "never"
}
```

## Tunnel with ngrok (expose `localhost:3000`)

For your mobile app → Mac Mini:

```bash
# 1. Install ngrok
brew install ngrok          # macOS
# or: npm i -g ngrok  |  download from https://ngrok.com/download

# 2. Auth (once) — get token at https://dashboard.ngrok.com/get-started/your-authtoken
ngrok config add-authtoken <YOUR_TOKEN>

# 3. Run minion + tunnel (two terminals)
npm start                   # terminal 1
ngrok http 3000             # terminal 2 → gives https://xxxx.ngrok-free.app

# 4. Call via public URL
curl https://xxxx.ngrok-free.app/health
curl -X POST https://xxxx.ngrok-free.app/exec -H 'Content-Type: application/json' -d '{"prompt":"hi"}'
```

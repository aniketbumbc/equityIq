# Deploy EquityIQ on a VPS

These steps put the website at `https://example.com` and the API at `https://api.example.com` on one Ubuntu 22.04 or 24.04 server. Replace `example.com` with your domain in step 4.

## What runs where

| Part | Runs as | Listens on | Public address |
|---|---|---|---|
| API (`server/`) | `equityiq-api` systemd service | `127.0.0.1:8000` | `https://api.example.com` through Nginx |
| Website (`client/`) | `equityiq-web` systemd service | `127.0.0.1:3000` | `https://example.com` through Nginx |

Both apps listen on localhost only, so Nginx is the only way in.

## Before you start

- A VPS with at least 2 GB of RAM. `npm run build` needs it.
- DNS `A` records for `example.com`, `www.example.com`, and `api.example.com` pointing at the server's IP address.
- Your four API keys: OpenAI, Twelve Data, Tavily, and Alpha Vantage.

## 1. Install system packages

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx certbot python3-certbot-nginx git ufw

# Node.js 20 or newer (Next.js 16 needs 20.9+)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

## 2. Get the code

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin equityiq
sudo git clone <your-repo-url> /opt/equityiq
sudo chown -R equityiq:equityiq /opt/equityiq
```

## 3. Set up the API

```bash
cd /opt/equityiq/server
sudo -u equityiq python3 -m venv venv
sudo -u equityiq venv/bin/pip install -r requirements.txt

sudo -u equityiq cp .env.example .env
sudo -u equityiq nano .env      # fill in the four keys, and set:
                                # CORS_ORIGINS=https://example.com,https://www.example.com
sudo chmod 600 .env
```

## 4. Build the website

```bash
cd /opt/equityiq/client
echo "NEXT_PUBLIC_API_URL=https://api.example.com" | sudo -u equityiq tee .env.production
sudo -u equityiq npm ci
sudo -u equityiq npm run build
```

`NEXT_PUBLIC_API_URL` is baked into the build. If you change it, run `npm run build` again.

## 5. Start both services

```bash
sudo cp /opt/equityiq/deploy/equityiq-api.service /opt/equityiq/deploy/equityiq-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now equityiq-api equityiq-web
systemctl status equityiq-api equityiq-web --no-pager
```

Check them before adding Nginx:

```bash
curl -s http://127.0.0.1:8000/docs | head -3     # API docs page
curl -sI http://127.0.0.1:3000 | head -1         # HTTP/1.1 200 OK
```

## 6. Nginx and HTTPS

Put your domain into the config, enable it, and get certificates:

```bash
sudo sed 's/example\.com/yourdomain.com/g' /opt/equityiq/deploy/nginx-equityiq.conf \
  | sudo tee /etc/nginx/sites-available/equityiq > /dev/null
sudo ln -s /etc/nginx/sites-available/equityiq /etc/nginx/sites-enabled/equityiq
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -d api.yourdomain.com
```

Certbot adds HTTPS to both server blocks and renews the certificates automatically.

## 7. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Ports 3000 and 8000 stay closed to the internet.

## Updating to a new version

```bash
cd /opt/equityiq
sudo -u equityiq git pull
sudo -u equityiq server/venv/bin/pip install -r server/requirements.txt
cd client && sudo -u equityiq npm ci && sudo -u equityiq npm run build
sudo systemctl restart equityiq-api equityiq-web
```

Restarting the API drops any run that is in progress or waiting for review (see below).

## Logs

```bash
journalctl -u equityiq-api -f
journalctl -u equityiq-web -f
sudo tail -f /var/log/nginx/error.log
```

## Things to know

- **One API worker.** Runs that wait for review are kept in the API process's memory (`InMemorySaver` in `server/graph.py`). The service runs one worker so every resume reaches the process that started the run. A restart loses those runs. Moving to the Postgres checkpointer (already in `requirements.txt`) would keep runs across restarts and allow more workers.
- **Rate limits.** Every question spends paid API credits, so there are two limits, both per visitor IP address:
  - The API allows **5 new questions per rolling 30 minutes**. Approving, revising, or rejecting a draft does not count. The sixth question gets HTTP 429 and the page shows "You can ask 5 questions every 30 minutes. Try again in N minutes." Change it with `RATE_LIMIT_QUESTIONS` and `RATE_LIMIT_WINDOW_MINUTES` in `server/.env`, or set `RATE_LIMIT_QUESTIONS=0` to turn it off. The counts live in the API's memory, so restarting the API resets them.
  - Nginx also caps bursts at about 6 requests a minute (`rate=` in the Nginx config), which covers rapid approve and revise clicks too.
- **Streaming.** The API streams progress as server-sent events. The Nginx config turns buffering off and allows 10-minute responses for `/api/`. Without that, the progress would only appear when a run ends.

## If something does not work

| Symptom | Likely cause |
|---|---|
| The page loads but every run fails at once, and the browser console shows a CORS error | `CORS_ORIGINS` in `server/.env` does not list the site's exact origin (`https://`, with or without `www`). Fix it and `sudo systemctl restart equityiq-api`. |
| Runs call `127.0.0.1:8000` | `NEXT_PUBLIC_API_URL` was not set when the site was built. Set it in `client/.env.production` and rebuild. |
| Progress appears all at once at the end | Nginx is buffering. Check `proxy_buffering off;` in the `/api/` block. |
| Runs cut off after about a minute | The proxy timeout is too short. Check `proxy_read_timeout 600s;`. |
| An agent shows "… is not set" | That key is missing from `server/.env`. Add it and restart the API. |

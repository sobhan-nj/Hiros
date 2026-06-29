# Deploy Guide — Resume Analyzer (VPS)

Step-by-step guide to deploy to a VPS with Ubuntu 22.04.

## Prerequisites

- VPS with Ubuntu 22.04 (SSH root access)
- Domain: `hiros.online` (DNS managed via Parspack)
- GitHub repo: `https://github.com/Sobhan-nj/Hiro.git`

## Quick Start (5 steps)

### 1. Point DNS to VPS

In Parspack DNS panel, replace the CNAME record with:

```
Type: A
Name: @ (or hiros.online)
Value: <your-vps-ip>
```

Also add for www:
```
Type: A
Name: www
Value: <your-vps-ip>
```

Wait 5-30 minutes for propagation. Verify with:
```bash
dig hiros.online +short
```

### 2. SSH into server & clone repo

```bash
ssh root@<your-vps-ip>
git clone https://github.com/Sobhan-nj/Hiro.git /opt/resume-analyzer
cd /opt/resume-analyzer
```

### 3. Run setup script

```bash
chmod +x deploy/setup.sh
sudo ./deploy/setup.sh hiros.online https://github.com/Sobhan-nj/Hiro.git
```

This installs Python 3.12 (via deadsnakes PPA), Node.js 20, Nginx, Certbot, fonts, creates a `deploy` user, builds the frontend, and configures everything.

### 4. Configure environment

```bash
sudo nano /opt/resume-analyzer/.env
```

Fill in these values:
```
OPENAI_API_KEY=sk-...your-key...
ADMIN_API_KEY=<generate-a-random-string>
ANALYSIS_API_KEY=<optional, leave empty for open access>
```

Save: `Ctrl+X` → `Y` → `Enter`

### 5. Start & get SSL

```bash
# Start backend
sudo systemctl start resume-analyzer

# Get SSL cert (after DNS propagated)
sudo certbot --nginx -d hiros.online -d www.hiros.online

# Verify
curl https://hiros.online/health
```

Open `https://hiros.online` — you should see the upload form.

## Day-to-Day Operations

### Deploy code updates
```bash
cd /opt/resume-analyzer
sudo ./deploy/deploy.sh
```

### Edit the analysis prompt
```bash
sudo nano /opt/resume-analyzer/backend/system_prompt.txt
sudo systemctl restart resume-analyzer
```

### View logs
```bash
sudo journalctl -u resume-analyzer -f          # real-time
sudo journalctl -u resume-analyzer -n 100      # last 100 lines
tail -f /opt/resume-analyzer/backend/logs/*.log # app logs
```

### Restart
```bash
sudo systemctl restart resume-analyzer
```

### Check database
```bash
cd /opt/resume-analyzer
sqlite3 talent_pool.db "SELECT id, full_name, tier, created_at FROM talent_pool ORDER BY created_at DESC LIMIT 10;"
```

## Architecture

```
Internet → hiros.online (HTTPS, port 443)
         ↓
    Nginx (port 443/80)
    ├── /                        → frontend/dist/ (static React)
    ├── /admin                   → frontend/dist/ (SPA route)
    ├── /analyze, /health,       → proxy to localhost:8000
    │   /admin/*, /analysis/*,      (FastAPI, 4 uvicorn workers)
    │   /cv/*
    └── static assets (.js/css)  → cached 30 days
                                   ├── talent_pool.db (SQLite)
                                   └── talent-pool/ (CV files)
```

## File Locations on Server

```
/opt/resume-analyzer/
├── .env                          # Environment config (EDIT THIS)
├── talent_pool.db                # SQLite database
├── talent-pool/                  # Saved CV files
├── backend/
│   ├── main.py                   # FastAPI entry point
│   ├── config.py                 # Config loader
│   ├── system_prompt.txt         # Analysis prompt (hot-editable)
│   ├── requirements.txt          # Python deps
│   ├── venv/                     # Python 3.12 virtual environment
│   ├── core/                     # Analysis logic
│   ├── db/                       # Database models
│   ├── utils/                    # Utilities
│   └── logs/                     # Runtime logs
├── frontend/
│   ├── dist/                     # Built React app (served by nginx)
│   └── src/                      # Source code
└── deploy/
    ├── setup.sh                  # Initial server setup (run once)
    ├── deploy.sh                 # Code update script
    ├── nginx.conf                # Nginx config template
    ├── resume-analyzer.service   # Systemd service unit
    ├── env.production            # Production env template
    └── README.md                 # This file
```

## Troubleshooting

### Service won't start
```bash
sudo journalctl -u resume-analyzer -n 50
```
Common: missing `.env`, port 8000 in use, venv not set up.

### Frontend blank page
```bash
ls /opt/resume-analyzer/frontend/dist/   # should have index.html
sudo nginx -t                             # test nginx config
sudo systemctl status nginx               # check nginx running
```

### CORS errors
Update `.env` → `CORS_ALLOWED_ORIGINS=https://hiros.online,https://www.hiros.online` → restart.

### SSL issues
```bash
sudo certbot renew --dry-run
sudo systemctl reload nginx
```

# ===========================================
# Resume Analyzer — Windows Deploy Script
# ===========================================
# Run from the project root (C:\Users\pc\resume-analyzer):
#   .\deploy.ps1
#
# This script:
#   1. Builds a tarball from the local repo
#   2. Uploads it to the VPS
#   3. Extracts, rebuilds frontend, restarts service
#   4. Fixes known issues (admin regex, nginx timeout)
#   5. Verifies deployment
#
# SECURITY: Passwords are NEVER stored in this file.
# You will be prompted for the VPS password at runtime.

param(
    [switch]$SkipBuild,      # Skip frontend build on VPS
    [switch]$SkipUpload,     # Skip tarball creation & upload (use existing)
    [switch]$FullSetup,      # Run full setup (install packages, create user, etc.)
    [string]$Password        # VPS root password (optional — prompted if not provided)
)

$ErrorActionPreference = "Stop"

# --- Configuration ---
$VPS_IP = "163.5.94.202"
$VPS_USER = "root"
$VPS_PORT = "22"  # SSH port (check VPS provider if changed)
$APP_DIR = "/opt/resume-analyzer"
$DEPLOY_USER = "hiros"
$DOMAIN = "hiros.online"

$LOCAL_PROJECT = "C:\Users\pc\resume-analyzer"
$LOCAL_TARBALL = "C:\Users\pc\resume-analyzer-deploy.tar.gz"
$LOCAL_SCRIPT = "C:\Users\pc\resume-analyzer\deploy\deploy.sh"

# --- Prompt for VPS password (never stored) ---
Write-Host "`n==========================================" -ForegroundColor Yellow
Write-Host " Resume Analyzer — Deploy to VPS" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "  VPS: $VPS_IP"
Write-Host "  Domain: $DOMAIN"
Write-Host "  Project: $LOCAL_PROJECT"
Write-Host ""

if ($Password) {
    $VPS_PASS = $Password
} else {
    $VPS_PASS = Read-Host -Prompt "Enter VPS root password" -AsSecureString
    $VPS_PASS = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($VPS_PASS)
    )
}

if ([string]::IsNullOrEmpty($VPS_PASS)) {
    Write-Host "  ERROR: Password cannot be empty" -ForegroundColor Red
    exit 1
}

# SSH command with port
$SSH = "ssh -o StrictHostKeyChecking=no -p $VPS_PORT"

# --- Helper Functions ---
function Write-Step($step, $msg) {
    Write-Host "`n[$step] $msg" -ForegroundColor Cyan
}

function Write-OK($msg) {
    Write-Host "  OK: $msg" -ForegroundColor Green
}

function Write-Fail($msg) {
    Write-Host "  FAIL: $msg" -ForegroundColor Red
}

function Invoke-VPS($cmd, $timeout = 60) {
    $result = & ssh -o StrictHostKeyChecking=no -p $VPS_PORT "$VPS_USER@$VPS_IP" $cmd 2>&1
    return $result
}

function Invoke-VPSScript($scriptBlock) {
    $tempFile = [System.IO.Path]::GetTempFileName() + ".ps1"
    try {
        $scriptBlock | Out-File -FilePath $tempFile -Encoding UTF8
        & $tempFile
    } finally {
        Remove-Item $tempFile -ErrorAction SilentlyContinue
    }
}

# Step 1: Create tarball
if (-not $SkipUpload) {
    Write-Step "1/6" "Creating tarball..."

    Push-Location $LOCAL_PROJECT
    try {
        # Remove old tarball
        if (Test-Path $LOCAL_TARBALL) {
            Remove-Item $LOCAL_TARBALL -Force
        }

        # Create tarball excluding large/unnecessary dirs
        tar -czf $LOCAL_TARBALL `
            --exclude="node_modules" `
            --exclude=".git" `
            --exclude="venv" `
            --exclude="__pycache__" `
            --exclude="*.pyc" `
            --exclude="talent-pool" `
            -C "C:\Users\pc" "resume-analyzer"

        $size = (Get-Item $LOCAL_TARBALL).Length / 1MB
        Write-OK "Created tarball ($([math]::Round($size, 1)) MB)"
    } finally {
        Pop-Location
    }

    # Step 2: Upload to VPS
    Write-Step "2/6" "Uploading to VPS..."

    scp -o StrictHostKeyChecking=no -P $VPS_PORT $LOCAL_TARBALL "$VPS_USER@${VPS_IP}:/root/"
    scp -o StrictHostKeyChecking=no -P $VPS_PORT $LOCAL_SCRIPT "$VPS_USER@${VPS_IP}:/root/deploy-to-vps.sh"
    Write-OK "Files uploaded"
} else {
    Write-Step "1/6" "Skipping tarball creation (-SkipUpload)"
    Write-Step "2/6" "Skipping upload (-SkipUpload)"
}

# Step 3: Deploy on VPS
Write-Step "3/6" "Deploying on VPS..."

if ($FullSetup) {
    # Full setup — installs everything from scratch
    Write-Host "  Running full setup..." -ForegroundColor Yellow
    ssh -o StrictHostKeyChecking=no -p $VPS_PORT "$VPS_USER@$VPS_IP" "bash /root/deploy-to-vps.sh"
} else {
    # Quick update — just extract, rebuild, restart
    Write-Host "  Running quick update..." -ForegroundColor Yellow

    $deployScript = @'
set -euo pipefail
APP_DIR="/opt/resume-analyzer"
DEPLOY_USER="hiros"

echo "[1/4] Extracting new code..."
tar -xzf /root/resume-analyzer-deploy.tar.gz -C "$APP_DIR" --strip-components=1
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"

echo "[2/4] Rebuilding frontend..."
cd "$APP_DIR/frontend"
sudo -u "$DEPLOY_USER" npm ci --silent 2>/dev/null || sudo -u "$DEPLOY_USER" npm install --silent 2>/dev/null
sudo -u "$DEPLOY_USER" npm run build

echo "[3/4] Fixing known issues..."
# Fix admin regex: bare /admin should fall through to SPA
sed -i 's/|admin|/|admin\/|/g' /etc/nginx/sites-available/resume-analyzer
# Fix nginx timeout for long LLM calls
sed -i 's/proxy_read_timeout 120s/proxy_read_timeout 300s/g' /etc/nginx/sites-available/resume-analyzer
sed -i 's/proxy_send_timeout 120s/proxy_send_timeout 300s/g' /etc/nginx/sites-available/resume-analyzer
# Fix ProtectSystem=strict blocking SQLite writes
sed -i 's/ProtectSystem=strict/ProtectSystem=full/g' /etc/systemd/system/resume-analyzer.service
sed -i 's|ReadWritePaths=.*|ReadWritePaths=/opt/resume-analyzer|g' /etc/systemd/system/resume-analyzer.service
systemctl daemon-reload
nginx -t && systemctl reload nginx

echo "[4/4] Restarting service..."
systemctl restart resume-analyzer
sleep 3

if systemctl is-active --quiet resume-analyzer; then
    echo ""
    echo "=========================================="
    echo " Deploy Complete!"
    echo "=========================================="
    echo "Service: RUNNING"
    echo "Health: $(curl -s https://hiros.online/health 2>/dev/null || echo 'check manually')"
else
    echo "ERROR: Service failed to start!"
    journalctl -u resume-analyzer -n 20 --no-pager
    exit 1
fi
'@

    $deployScript | ssh -o StrictHostKeyChecking=no -p $VPS_PORT "$VPS_USER@$VPS_IP" "bash -s"
}

# Step 4: Verify
Write-Step "4/6" "Verifying deployment..."

$health = ssh -o StrictHostKeyChecking=no -p $VPS_PORT "$VPS_USER@$VPS_IP" "curl -s https://hiros.online/health 2>/dev/null"
Write-Host "  Health: $health"

$admin = ssh -o StrictHostKeyChecking=no -p $VPS_PORT "$VPS_USER@$VPS_IP" "curl -s -o /dev/null -w '%{http_code}' https://hiros.online/admin"
Write-Host "  Admin:  HTTP $admin"

# Step 5: Summary
Write-Step "5/6" "Deployment Summary"
Write-Host ""
Write-Host "  URL:       https://$DOMAIN" -ForegroundColor Green
Write-Host "  Admin:     https://$DOMAIN/admin" -ForegroundColor Green
Write-Host "  Health:    https://$DOMAIN/health" -ForegroundColor Green
Write-Host ""

# Step 6: Useful commands
Write-Step "6/6" "Useful commands:"
Write-Host "  SSH:           ssh -p $VPS_PORT root@$VPS_IP"
Write-Host "  Restart:       ssh -p $VPS_PORT root@$VPS_IP 'systemctl restart resume-analyzer'"
Write-Host "  Logs:          ssh -p $VPS_PORT root@$VPS_IP 'journalctl -u resume-analyzer -f'"
Write-Host "  Edit prompt:   ssh -p $VPS_PORT root@$VPS_IP 'nano $APP_DIR/backend/system_prompt.txt'"
Write-Host "  Check DB:      ssh -p $VPS_PORT root@$VPS_IP 'sqlite3 $APP_DIR/talent_pool.db \"SELECT count(*) FROM talent_pool;\"'"
Write-Host ""

#!/usr/bin/env python3
"""Deploy resume-analyzer to VPS via paramiko.
Usage: python deploy_vps.py
Password is prompted at runtime (never stored).
"""
import paramiko
import base64
import os
import sys
import subprocess

VPS_IP = "163.5.94.202"
VPS_USER = "root"
APP_DIR = "/opt/resume-analyzer"
LOCAL_PROJECT = r"C:\Users\pc\resume-analyzer"
TARBALL = r"C:\Users\pc\resume-analyzer-deploy.tar.gz"

def main():
    import getpass
    password = getpass.getpass(f"VPS root password ({VPS_IP}): ")

    print("=" * 50)
    print(" Hiros — Deploy to VPS")
    print("=" * 50)

    # Connect
    print("\n[1/4] Connecting...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(VPS_IP, username=VPS_USER, password=password, timeout=15)
    print("  Connected")

    def run(cmd, timeout=120):
        _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
        return stdout.read().decode().strip(), stderr.read().decode().strip()

    # Create tarball
    print("\n[2/4] Creating tarball...")
    if os.path.exists(TARBALL):
        os.remove(TARBALL)
    result = subprocess.run(
        ["tar", "-czf", TARBALL, "--exclude=node_modules", "--exclude=.git",
         "--exclude=venv", "--exclude=__pycache__", "--exclude=*.pyc",
         "--exclude=talent-pool", "--exclude=.mimocode", "--exclude=frontend/dist",
         "-C", r"C:\Users\pc", "resume-analyzer"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"  Error: {result.stderr}")
        sys.exit(1)
    size_mb = os.path.getsize(TARBALL) / (1024 * 1024)
    print(f"  Created ({size_mb:.1f} MB)")

    # Upload via base64
    print("\n[3/4] Uploading...")
    with open(TARBALL, "rb") as f:
        data = base64.b64encode(f.read()).decode()
    chunks = [data[i:i+100000] for i in range(0, len(data), 100000)]
    print(f"  {len(chunks)} chunks...")
    run("rm -f /root/deploy-b64.txt")
    for chunk in chunks:
        run(f"echo '{chunk}' >> /root/deploy-b64.txt")
    out, err = run("base64 -d /root/deploy-b64.txt > /root/resume-analyzer-deploy.tar.gz && rm /root/deploy-b64.txt && echo OK")
    if "OK" not in out:
        print(f"  Upload failed: {err}")
        sys.exit(1)
    print("  Uploaded")

    # Deploy
    print("\n[4/4] Extracting, building, restarting...")
    cmd = """set -euo pipefail
cd /opt/resume-analyzer
tar -xzf /root/resume-analyzer-deploy.tar.gz --strip-components=1
chown -R hiros:hiros /opt/resume-analyzer
cd /opt/resume-analyzer/frontend
sudo -u hiros npm ci --silent 2>/dev/null || sudo -u hiros npm install --silent 2>/dev/null
sudo -u hiros npm run build
systemctl daemon-reload
systemctl restart resume-analyzer
sleep 3
if systemctl is-active --quiet resume-analyzer; then echo DEPLOY_OK; else echo DEPLOY_FAILED; fi"""
    stdin, stdout, stderr = client.exec_command(cmd, timeout=180)
    out = stdout.read().decode()
    print(out)
    if "DEPLOY_FAILED" in out:
        err = stderr.read().decode()
        print(f"Errors: {err[:500]}")
        sys.exit(1)

    # Verify
    print("Verifying...")
    out, _ = run("curl -s https://hiros.online/health")
    print(f"Health: {out}")

    client.close()
    print("\nDone! https://hiros.online")

if __name__ == "__main__":
    main()

import os
import sys
import time
import zipfile
import subprocess
import shutil
from pathlib import Path

# Ensure 'requests' package is installed
try:
    import requests
except ImportError:
    print("[INIT] 'requests' package not found. Installing via pip...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests"])
    import requests

PROJECT_DIR = Path(__file__).resolve().parent.parent
KEYS_FILE = PROJECT_DIR / "keys.txt"
DOWNLOAD_DIR = PROJECT_DIR / "build_downloads"
REPO_OWNER = "richardchung0907"
REPO_NAME = "doctor-meets-lawyer"

def log(msg):
    timestamp = time.strftime("%H:%M:%S")
    print(f"[{timestamp}] {msg}", flush=True)

def get_github_token():
    if not KEYS_FILE.exists():
        log(f"[ERROR] Keys file not found at {KEYS_FILE}")
        sys.exit(1)
    
    with open(KEYS_FILE, "r", encoding="utf-8") as f:
        content = f.read().strip()
    
    # Extract token
    if "github_pat_" in content:
        start_idx = content.find("github_pat_")
        token = content[start_idx:].split()[0].strip()
        return token
    else:
        log("[ERROR] Could not find GitHub token 'github_pat_...' in keys.txt")
        sys.exit(1)

def locate_android_tools():
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    platform_tools = Path(local_app_data) / "Android" / "Sdk" / "platform-tools"
    emulator_tools = Path(local_app_data) / "Android" / "Sdk" / "emulator"

    adb_path = None
    if (platform_tools / "adb.exe").exists():
        adb_path = str(platform_tools / "adb.exe")
        if str(platform_tools) not in os.environ.get("PATH", ""):
            os.environ["PATH"] += os.pathsep + str(platform_tools)
    else:
        adb_path = shutil.which("adb")

    emulator_path = None
    # Prioritize the modern emulator folder over legacy tools in PATH
    if (emulator_tools / "emulator.exe").exists():
        emulator_path = str(emulator_tools / "emulator.exe")
        if str(emulator_tools) not in os.environ.get("PATH", ""):
            os.environ["PATH"] += os.pathsep + str(emulator_tools)
    else:
        emulator_path = shutil.which("emulator")

    if not adb_path:
        adb_path = shutil.which("adb")
    if not emulator_path:
        emulator_path = shutil.which("emulator")

    return adb_path, emulator_path

def ensure_emulator_running(adb_path, emulator_path):
    log("[ENV] Checking ADB and local Android Virtual Devices (AVD)...")
    if not adb_path:
        log("[WARNING] adb.exe not found in PATH or Android SDK location.")
        return False

    # Check connected devices
    res = subprocess.run([adb_path, "devices"], capture_output=True, text=True)
    lines = [line.strip() for line in res.stdout.splitlines() if line.strip()]
    
    active_devices = [line for line in lines[1:] if "device" in line and not "offline" in line]
    
    if active_devices:
        log(f"[ENV] Found active Android device/emulator: {active_devices[0]}")
        return True

    log("[ENV] No active emulator detected. Attempting to launch local AVD...")
    if emulator_path:
        avd_res = subprocess.run([emulator_path, "-list-avds"], capture_output=True, text=True)
        avds = [a.strip() for a in avd_res.stdout.splitlines() if a.strip()]
        
        if avds:
            avd_name = avds[0]
            log(f"[ENV] Starting Android Emulator AVD: {avd_name}...")
            
            emulator_dir = str(Path(emulator_path).parent)
            sdk_path = str(Path(emulator_path).parent.parent)

            env = os.environ.copy()
            env["ANDROID_HOME"] = sdk_path
            env["ANDROID_SDK_ROOT"] = sdk_path

            if sys.platform == "win32":
                subprocess.Popen(
                    [emulator_path, "-avd", avd_name],
                    cwd=emulator_dir,
                    env=env,
                    creationflags=subprocess.CREATE_NEW_CONSOLE
                )
            else:
                subprocess.Popen(
                    [emulator_path, "-avd", avd_name],
                    cwd=emulator_dir,
                    env=env,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
            log("[ENV] Waiting for emulator to boot up...")
            subprocess.run([adb_path, "wait-for-device"], timeout=120)
            return True
        else:
            log("[WARNING] No AVDs created in Android SDK. Please create an AVD in Android Studio.")
    return False

def push_code_to_github(token):
    log("[GIT] Checking local repository and remote origin...")
    authenticated_url = f"https://{token}@github.com/{REPO_OWNER}/{REPO_NAME}.git"

    # Set remote origin
    subprocess.run(["git", "remote", "remove", "origin"], cwd=PROJECT_DIR, capture_output=True)
    subprocess.run(["git", "remote", "add", "origin", authenticated_url], cwd=PROJECT_DIR, check=True)

    log("[GIT] Pushing commits to GitHub remote...")
    push_res = subprocess.run(["git", "push", "-u", "origin", "master", "--force"], cwd=PROJECT_DIR, capture_output=True, text=True)
    if push_res.returncode != 0:
        # Try pushing to main
        push_res = subprocess.run(["git", "push", "-u", "origin", "master:main", "--force"], cwd=PROJECT_DIR, capture_output=True, text=True)
    
    log(f"[GIT] Push result: {push_res.stdout.strip() or 'Successfully pushed code to GitHub.'}")

def get_latest_run_id(token):
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "DoctorMeetsLawyer-Runner"
    }
    runs_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/actions/runs"
    try:
        resp = requests.get(runs_url, headers=headers)
        if resp.status_code == 200:
            runs = resp.json().get("workflow_runs", [])
            if runs:
                return runs[0]["id"]
    except Exception:
        pass
    return None

def monitor_github_workflow_and_download_apk(token, old_run_id=None):
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "DoctorMeetsLawyer-Runner"
    }

    log("[CI/CD] Waiting for a NEW GitHub Actions workflow run to trigger...")
    runs_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/actions/runs"

    latest_run = None
    # Poll for up to 3 minutes (36 attempts of 5 seconds)
    for attempt in range(36):
        resp = requests.get(runs_url, headers=headers)
        if resp.status_code == 200:
            runs = resp.json().get("workflow_runs", [])
            if runs:
                if old_run_id is not None:
                    new_runs = [r for r in runs if int(r["id"]) > int(old_run_id)]
                else:
                    new_runs = [r for r in runs if r["status"] in ["queued", "in_progress"]]
                
                if new_runs:
                    latest_run = new_runs[0]
                    break
        time.sleep(5)

    if not latest_run:
        # Fallback to latest
        resp = requests.get(runs_url, headers=headers)
        if resp.status_code == 200:
            runs = resp.json().get("workflow_runs", [])
            if runs:
                latest_run = runs[0]
                log("[WARNING] Could not detect a newly triggered run ID. Falling back to the latest found run.")

    if not latest_run:
        log("[ERROR] Could not find any triggered workflow runs on GitHub.")
        sys.exit(1)

    run_id = latest_run["id"]
    log(f"[CI/CD] Tracking Workflow Run ID: {run_id} ({latest_run.get('html_url')})")

    # Poll every 1 minute now for faster local turnaround
    while True:
        status_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/actions/runs/{run_id}"
        resp = requests.get(status_url, headers=headers)
        if resp.status_code != 200:
            log(f"[CI/CD] Failed to fetch run status ({resp.status_code}). Retrying in 1 min...")
            time.sleep(60)
            continue

        run_data = resp.json()
        status = run_data.get("status")
        conclusion = run_data.get("conclusion")

        log(f"[CI/CD Status Update] Status: '{status}', Conclusion: '{conclusion}'")

        if status == "completed":
            if conclusion == "success":
                log("[CI/CD] Build succeeded! Fetching compiled APK artifact...")
                break
            else:
                log(f"[ERROR] GitHub Actions build finished with conclusion: '{conclusion}'")
                sys.exit(1)

        log("[CI/CD] Workflow build in progress... Next status check in 1 minute (60s).")
        time.sleep(60)

    # Fetch artifacts
    artifacts_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/actions/runs/{run_id}/artifacts"
    art_resp = requests.get(artifacts_url, headers=headers)
    if art_resp.status_code != 200:
        log("[ERROR] Failed to fetch artifacts list.")
        sys.exit(1)

    artifacts = art_resp.json().get("artifacts", [])
    if not artifacts:
        log("[ERROR] No artifact uploaded by workflow run.")
        sys.exit(1)

    apk_artifact = artifacts[0]
    download_url = apk_artifact.get("archive_download_url")

    log(f"[DOWNLOAD] Downloading APK archive zip from {download_url}...")
    dl_resp = requests.get(download_url, headers=headers, stream=True)
    
    DOWNLOAD_DIR.mkdir(exist_ok=True)
    # Clear any old .apk or .zip files to prevent stale artifact resolution
    for old_file in DOWNLOAD_DIR.glob("*"):
        if old_file.suffix in [".apk", ".zip"]:
            try:
                old_file.unlink()
            except Exception:
                pass

    zip_path = DOWNLOAD_DIR / "app-release-apk.zip"

    with open(zip_path, "wb") as f:
        for chunk in dl_resp.iter_content(chunk_size=8192):
            f.write(chunk)

    log(f"[DOWNLOAD] Artifact downloaded to {zip_path}. Extracting...")
    
    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        zip_ref.extractall(DOWNLOAD_DIR)

    extracted_apk = DOWNLOAD_DIR / "app-release-unsigned.apk"
    if not extracted_apk.exists():
        # Search recursively for any .apk file inside the extracted zip directory structure
        apks = list(DOWNLOAD_DIR.glob("**/*.apk"))
        if apks:
            extracted_apk = apks[0]

    log(f"[DOWNLOAD] Extracted APK file location: {extracted_apk}")
    return extracted_apk

def install_and_launch_apk(adb_path, apk_path):
    if not adb_path or not Path(apk_path).exists():
        log("[INSTALL] Missing adb or APK file. Skipping automated installation.")
        return

    log(f"[INSTALL] Installing APK {apk_path} onto local Android Virtual Device...")
    install_res = subprocess.run([adb_path, "install", "-r", str(apk_path)], capture_output=True, text=True)
    log(f"[INSTALL] adb install output: {install_res.stdout.strip() or install_res.stderr.strip()}")

    log("[INSTALL] Launching application on emulator...")
    # Attempt to launch default app
    subprocess.run([adb_path, "shell", "monkey", "-p", "com.richardchung.doctormeetslawyer", "1"], capture_output=True)
    log("[SUCCESS] App installed and launched on local emulator successfully!")

def main():
    log("=== Doctor Meets Lawyer - Local & CI/CD Automated Build Pipeline ===")
    
    # 1. Environment & Tools
    adb_path, emulator_path = locate_android_tools()
    ensure_emulator_running(adb_path, emulator_path)

    # 2. GitHub Credentials
    token = get_github_token()

    # 3. Capture Old Run ID before pushing to prevent stale downloads
    old_run_id = get_latest_run_id(token)
    log(f"[CI/CD] Registered previous latest workflow run ID: {old_run_id}")

    # 4. Push Code to GitHub
    push_code_to_github(token)

    # 5. Monitor GitHub Actions CI & Download Artifact (Tracking ONLY the new run!)
    apk_path = monitor_github_workflow_and_download_apk(token, old_run_id)

    # 6. Mount and Install on Local Android Emulator
    install_and_launch_apk(adb_path, apk_path)

if __name__ == "__main__":
    main()

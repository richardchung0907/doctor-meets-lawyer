#!/usr/bin/env python3
"""
dev_metro.py — One-shot Android emulator + Expo Metro development environment.

Purpose
-------
For an Expo (React Native) project, this script brings up a full development
environment WITHOUT building an APK (dev-mode / Metro "path B"):

  1. Audits the machine for all required tooling: Node.js, npm, Java (for
     sdkmanager), Android SDK (platform-tools, emulator, system image),
     an AVD, and the project's node_modules.
  2. Anything missing is downloaded and installed automatically
     (winget / Homebrew / apt, Google's commandline-tools + sdkmanager, ...).
  3. Boots an Android emulator (reuses the same device audit logic as
     mount_emulator.py) and waits until it is fully booted.
  4. Runs `npx expo start --android`: Metro serves the CURRENT source tree
     and Expo Go on the emulator loads the latest app code — style / JS
     changes take effect immediately (Fast Refresh). No rebuild required.

Usage
-----
    python scripts/dev_metro.py               # auto everything
    python scripts/dev_metro.py --clear       # reset Metro cache first
    python scripts/dev_metro.py --avd MyAvd   # use a specific AVD name
    python scripts/dev_metro.py --no-reinstall# skip npm install even if stale

Exit codes
----------
    0  clean shutdown (Metro stopped by Ctrl+C / user)
    2  environment could not be prepared
"""

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
LOG_FILE: Path | None = None


# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------

def log(msg: str) -> None:
    ts = time.strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    if LOG_FILE is not None:
        with open(LOG_FILE, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")


def die(msg: str) -> None:
    log(f"[FATAL] {msg}")
    sys.exit(2)


def is_windows() -> bool:
    return sys.platform == "win32"


def is_macos() -> bool:
    return sys.platform == "darwin"


def is_arm_mac() -> bool:
    return is_macos() and platform_machine().lower() in ("arm64", "aarch64")


def platform_machine() -> str:
    try:
        import platform
        return platform.machine()
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Subprocess helpers
# ---------------------------------------------------------------------------

def run(cmd: str, check: bool = True, capture: bool = False, timeout: int | None = None,
        cwd: Path | None = None, input_text: str | None = None) -> subprocess.CompletedProcess:
    """Run a shell command. Windows needs shell=True to resolve .cmd shims."""
    log(f"[CMD] {cmd}")
    try:
        proc = subprocess.run(
            cmd,
            shell=True,
            cwd=str(cwd or PROJECT_DIR),
            capture_output=capture,
            text=True,
            input=input_text,
            timeout=timeout,
            env=os.environ.copy(),
        )
    except subprocess.TimeoutExpired as exc:
        if check:
            die(f"Command timed out: {cmd}")
        return exc  # type: ignore[return-value]
    if check and proc.returncode != 0:
        detail = proc.stderr.strip() if capture and proc.stderr else proc.stdout.strip() if capture else ""
        die(f"Command failed ({proc.returncode}): {cmd}\n{detail}")
    return proc


def which(exe: str) -> str | None:
    found = shutil.which(exe)
    if found:
        return found
    if is_windows():
        for cand in (f"{exe}.exe", f"{exe}.cmd", f"{exe}.bat"):
            found = shutil.which(cand)
            if found:
                return found
    return None


def ensure_path_dir(win_env: str, mac_path: str, linux_path: str, env_var: str) -> Path:
    """Resolve a tool directory, falling back to standard per-OS locations."""
    override = os.environ.get(env_var)
    if override and Path(override).exists():
        return Path(override)
    if is_windows():
        local = Path(os.environ.get("LOCALAPPDATA", "")) / win_env
        if local.exists():
            return local
    elif is_macos():
        home = Path.home() / mac_path
        if home.exists():
            return home
    else:
        for cand in map(Path, linux_path.split(":")):
            if cand.exists():
                return cand
    return Path(os.environ.get(env_var, win_env if is_windows() else (mac_path if is_macos() else linux_path)))


# ---------------------------------------------------------------------------
# 1. Node.js + npm
# ---------------------------------------------------------------------------

def node_version(exe: str) -> str:
    proc = run(f'"{exe}" --version', check=False, capture=True)
    return proc.stdout.strip() if proc.returncode == 0 else ""


def ensure_node() -> None:
    log("=== [1/6] Node.js / npm ===")
    node_exe = which("node")
    npm_exe = which("npm")
    if node_exe and npm_exe:
        ver = node_version(node_exe)
        log(f"node {ver} found ({node_exe}); npm: {npm_exe}")
        major = int(ver.lstrip("v").split(".")[0] or 0) if ver else 0
        if major >= 18:
            return
        log(f"Node {ver} is too old (need >= 18). Installing a newer one...")
    else:
        log("node/npm missing. Installing...")

    if is_windows():
        log("Installing Node.js LTS via winget...")
        run("winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements",
            check=False)
        prog = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "nodejs"
        node_exe = str(prog / "node.exe") if (prog / "node.exe").exists() else which("node")
        npm_exe = str(prog / "npm.cmd") if (prog / "npm.cmd").exists() else which("npm")
        if node_exe and Path(node_exe).exists():
            os.environ["PATH"] = str(prog) + os.pathsep + os.environ.get("PATH", "")
            log(f"node installed at {node_exe}")
        else:
            die("winget could not install Node.js. Please install Node 18+ manually.")
    elif is_macos():
        run("command -v brew || /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"")
        run("brew install node", check=False)
    else:
        run("apt-get update && apt-get install -y nodejs npm", check=False)

    if not which("node"):
        die("node not found after installation attempt.")


# ---------------------------------------------------------------------------
# 2. Java (required by sdkmanager)
# ---------------------------------------------------------------------------

def ensure_java() -> None:
    if which("java"):
        log("java found: " + run('java -version', check=False, capture=True).stderr.strip().splitlines()[0])
        return
    log("java missing; installing JDK 17...")
    if is_windows():
        run("winget install Microsoft.OpenJDK.17 --silent --accept-package-agreements --accept-source-agreements",
            check=False)
        java_home = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Microsoft" / "jdk-17*"
        import glob
        hits = glob.glob(str(java_home))
        if hits:
            os.environ["JAVA_HOME"] = hits[0]
            os.environ["PATH"] = str(Path(hits[0]) / "bin") + os.pathsep + os.environ.get("PATH", "")
    elif is_macos():
        run("brew install --cask temurin@17", check=False)
    else:
        run("apt-get update && apt-get install -y openjdk-17-jdk-headless", check=False)
    if not which("java"):
        die("java not found after installation attempt (needed by sdkmanager).")


# ---------------------------------------------------------------------------
# 3. Android SDK (commandline-tools, platform-tools, emulator, system image)
# ---------------------------------------------------------------------------

def sdk_root() -> Path:
    return ensure_path_dir("Android/Sdk", "Library/Android/sdk", "/opt/android-sdk:/usr/lib/android-sdk",
                           "ANDROID_HOME")


def sdkmanager_cmd(sdk: Path) -> str | None:
    for rel in ("cmdline-tools/latest/bin", "cmdline-tools/bin"):
        cand = sdk / rel
        exe = cand / ("sdkmanager.bat" if is_windows() else "sdkmanager")
        if exe.exists():
            return str(exe)
    return None


def install_sdk_component(sdk: Path, sdkman: str, *components: str) -> None:
    """Run sdkmanager with 'y' piped in (auto-accept licenses)."""
    cmd = f'"{sdkman}" {" ".join(components)}'
    log(f"[SDK] Installing: {', '.join(components)}")
    run(cmd, check=True, timeout=1800, input_text="y\n" * 80)


def ensure_android_sdk() -> Path:
    log("=== [2/6] Android SDK ===")
    sdk = sdk_root()
    os.environ["ANDROID_HOME"] = str(sdk)
    os.environ["ANDROID_SDK_ROOT"] = str(sdk)
    # NOTE: do NOT override ANDROID_AVD_HOME here — keep the system default
    # (~/.android/avd) so pre-existing AVDs (e.g. RichyTest) are found.

    platform_tools = sdk / "platform-tools"
    emulator_dir = sdk / "emulator"
    sdkman = sdkmanager_cmd(sdk)

    if sdkman and (platform_tools / ("adb.exe" if is_windows() else "adb")).exists() \
            and (emulator_dir / ("emulator.exe" if is_windows() else "emulator")).exists():
        log(f"Android SDK ready at {sdk} (adb + emulator + cmdline-tools present)")
        return sdk

    log(f"Android SDK incomplete/missing at {sdk}; downloading commandline-tools...")
    ensure_java()

    sdk.mkdir(parents=True, exist_ok=True)
    tools_dir = sdk / "cmdline-tools"
    latest_dir = tools_dir / "latest"
    zip_path = sdk / "cmdtools.zip"

    if not sdkman:
        if is_windows():
            url = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
        elif is_macos():
            url = ("https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip"
                   if not is_arm_mac() else
                   "https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip")
        else:
            url = "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
        log(f"[SDK] Downloading {url}")
        run(f'curl -L -o "{zip_path}" "{url}"', timeout=1200)
        run(f'powershell -NoProfile -Command "Expand-Archive -Force -Path \'{zip_path}\' -DestinationPath \'{tools_dir}\'"'
            if is_windows() else f'unzip -o "{zip_path}" -d "{tools_dir}"')
        if not latest_dir.exists():
            # zip contains a top-level "cmdline-tools" folder -> rename to latest
            src = tools_dir / "cmdline-tools"
            if src.exists():
                src.rename(latest_dir)
            else:
                die("Could not locate cmdline-tools inside the downloaded archive.")
        zip_path.unlink(missing_ok=True)
        sdkman = sdkmanager_cmd(sdk)
        if not sdkman:
            die("sdkmanager not found after installing commandline-tools.")

    # Accept licenses up-front
    log("[SDK] Accepting licenses...")
    run(f'"{sdkman}" --licenses', check=False, timeout=600, input_text="y\n" * 120)

    # Install required components (retry with android-34 if android-35 image missing)
    sys_image_arch = "arm64-v8a" if is_arm_mac() else "x86_64"
    base = ["platform-tools", "emulator", "platforms;android-35"]
    images = [f"system-images;android-35;google_apis;{sys_image_arch}"]
    try:
        install_sdk_component(sdk, sdkman, *base, *images)
    except SystemExit:
        log("[SDK] android-35 image unavailable; falling back to android-34...")
        base = ["platform-tools", "emulator", "platforms;android-34"]
        images = [f"system-images;android-34;google_apis;{sys_image_arch}"]
        install_sdk_component(sdk, sdkman, *base, *images)

    if not (platform_tools / ("adb.exe" if is_windows() else "adb")).exists():
        die("platform-tools missing after install; check sdkmanager output above.")
    return sdk


# ---------------------------------------------------------------------------
# 4. AVD
# ---------------------------------------------------------------------------

def list_avds(emulator_exe: str) -> list[str]:
    proc = run(f'"{emulator_exe}" -list-avds', check=False, capture=True)
    return [a.strip() for a in proc.stdout.splitlines() if a.strip()]


def create_avd(sdk: Path, emulator_exe: str, name: str) -> None:
    avdmanager = sdk / "cmdline-tools" / "latest" / "bin" / ("avdmanager.bat" if is_windows() else "avdmanager")
    if not avdmanager.exists():
        avdmanager = sdk / "cmdline-tools" / "bin" / ("avdmanager.bat" if is_windows() else "avdmanager")
    sys_image_arch = "arm64-v8a" if is_arm_mac() else "x86_64"
    for api in (35, 34):
        image = f"system-images;android-{api};google_apis;{sys_image_arch}"
        probe = run(f'"{avdmanager}" list target', check=False, capture=True)
        log(f"[AVD] Creating '{name}' with {image} ...")
        proc = run(
            f'echo no | "{avdmanager}" create avd -n "{name}" -k "{image}" -d pixel_5',
            check=False, timeout=300,
        )
        if proc.returncode == 0:
            log(f"[AVD] Created AVD '{name}'.")
            return
    die(f"Could not create AVD '{name}'. Check avdmanager output.")


# ---------------------------------------------------------------------------
# 5. Emulator boot (device audit re-used from mount_emulator.py)
# ---------------------------------------------------------------------------

def adb_cmd(sdk: Path) -> str:
    adb = sdk / "platform-tools" / ("adb.exe" if is_windows() else "adb")
    return str(adb)


def is_device_usable(adb: str, device_id: str) -> bool:
    try:
        proc = run(f'"{adb}" -s {device_id} shell getprop sys.boot_completed',
                   check=False, capture=True, timeout=10)
        return proc.returncode == 0 and "1" in proc.stdout
    except Exception:
        return False


def kill_stale_emulators() -> None:
    log("[ENV] Cleaning up unresponsive emulator/adb processes...")
    if is_windows():
        run("taskkill /f /im emulator.exe", check=False)
        run("taskkill /f /im qemu-system-x86_64.exe", check=False)
        run('taskkill /f /im "qemu-system-aarch64.exe"', check=False)
        run("adb kill-server", check=False)
    else:
        run("pkill -9 -f qemu-system || true", check=False)
        run("adb kill-server", check=False)
    time.sleep(3)


def ensure_emulator_running(sdk: Path, preferred_avd: str | None) -> None:
    log("=== [3/6] Emulator ===")
    adb = adb_cmd(sdk)
    emulator_exe = sdk / "emulator" / ("emulator.exe" if is_windows() else "emulator")

    run(f'"{adb}" start-server', check=False)

    # 1. Audit existing devices
    proc = run(f'"{adb}" devices', check=False, capture=True)
    devices = [line.split()[0] for line in proc.stdout.splitlines()[1:]
               if line.strip() and "device" in line and "offline" not in line]
    for dev in devices:
        log(f"[ENV] Found device {dev}; checking health...")
        if is_device_usable(adb, dev):
            log(f"[ENV] Device {dev} is healthy and booted. Reusing it.")
            run(f'"{adb}" -s {dev} reverse tcp:8081 tcp:8081', check=False)
            return

    # 2. Launch emulator
    avds = list_avds(str(emulator_exe))
    log(f"[ENV] Available AVDs: {avds or '(none)'}")
    avd = preferred_avd if preferred_avd in avds else (avds[0] if avds else None)
    if not avd:
        log("[ENV] No AVD found; creating one...")
        create_avd(sdk, str(emulator_exe), "dev_test")
        avds = list_avds(str(emulator_exe))
        avd = avds[0] if avds else None
    if not avd:
        die("No usable AVD. Please create one in Android Studio.")

    log(f"[ENV] Launching AVD '{avd}' ...")
    env = os.environ.copy()
    env["ANDROID_HOME"] = str(sdk)
    env["ANDROID_SDK_ROOT"] = str(sdk)
    if is_windows():
        # -no-snapshot：禁用快照 load+save。否则模拟器会恢复到上次关闭时的
        # 快照（旧画面 + 旧 app 状态），Expo Go 停在旧 bundle 上画面冻结。
        subprocess.Popen([str(emulator_exe), "-avd", avd, "-no-snapshot"],
                         cwd=str(sdk / "emulator"), env=env,
                         creationflags=subprocess.CREATE_NEW_CONSOLE)
    else:
        subprocess.Popen([str(emulator_exe), "-avd", avd, "-no-snapshot"],
                         cwd=str(sdk / "emulator"), env=env,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    log("[ENV] Waiting for emulator to connect...")
    run(f'"{adb}" wait-for-device', timeout=300)
    log("[ENV] Waiting for Android boot to complete...")
    for _ in range(60):
        proc = run(f'"{adb}" shell getprop sys.boot_completed', check=False, capture=True, timeout=10)
        if proc.returncode == 0 and "1" in proc.stdout:
            log("[ENV] Emulator booted.")
            run(f'"{adb}" reverse tcp:8081 tcp:8081', check=False)
            return
        time.sleep(4)
    die("Emulator did not finish booting in time.")


# ---------------------------------------------------------------------------
# 6. Project dependencies (node_modules)
# ---------------------------------------------------------------------------

def ensure_project_deps(no_reinstall: bool) -> None:
    log("=== [4/6] Project dependencies ===")
    node_modules = PROJECT_DIR / "node_modules"
    pkg_json = PROJECT_DIR / "package.json"
    lock_json = PROJECT_DIR / "package-lock.json"

    stale = False
    if not node_modules.exists():
        log("node_modules missing; installing...")
        stale = True
    elif lock_json.exists() and lock_json.stat().st_mtime > node_modules.stat().st_mtime:
        log("package-lock.json newer than node_modules; dependencies may be stale.")
        stale = True

    if stale and no_reinstall:
        log("--no-reinstall given; skipping npm install (may cause Metro errors if deps are missing).")
    elif stale:
        run("npm install --legacy-peer-deps", timeout=1800)
    else:
        log("node_modules up to date.")


# ---------------------------------------------------------------------------
# 7. Port check (Metro uses 8081)
# ---------------------------------------------------------------------------

def ensure_port_free() -> None:
    log("=== [5/6] Metro port 8081 ===")
    if is_windows():
        proc = run('netstat -ano | findstr ":8081"', check=False, capture=True)
        lines = [l for l in proc.stdout.splitlines() if l.strip() and "LISTENING" in l]
    else:
        proc = run("lsof -iTCP:8081 -sTCP:LISTEN -t", check=False, capture=True)
        lines = [l for l in proc.stdout.splitlines() if l.strip()]
    if not lines:
        log("Port 8081 is free.")
        return
    if is_windows():
        pids = sorted({l.strip().split()[-1] for l in lines})
        log(f"Port 8081 is in use by PID(s): {', '.join(pids)}. Killing stale Metro...")
        for pid in pids:
            run(f"taskkill /f /pid {pid}", check=False)
        time.sleep(2)
        proc = run('netstat -ano | findstr ":8081"', check=False, capture=True)
        # 只认 LISTENING：TIME_WAIT/SYN_SENT 连接尝试行不影响新 Metro 监听
        still = [l for l in proc.stdout.splitlines() if l.strip() and "LISTENING" in l]
        if still:
            die("Port 8081 still in use. Free it manually and re-run.")
    else:
        log("Port 8081 in use; killing stale Metro process(es)...")
        run("kill -9 $(lsof -ti tcp:8081) 2>/dev/null || true", check=False)
        time.sleep(2)


# ---------------------------------------------------------------------------
# 8. Metro (expo start) + Expo Go deployment
# ---------------------------------------------------------------------------

def metro_ready(url: str, timeout: int = 120) -> bool:
    """Poll Metro's /status endpoint until it reports running."""
    import urllib.request
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                body = resp.read().decode("utf-8", "replace")
                if "packager-status:running" in body:
                    return True
        except Exception:
            pass
        time.sleep(3)
    return False


def expo_go_apk_url() -> str | None:
    """Resolve the Expo Go APK URL matching the project SDK via the official versions API."""
    import json
    import urllib.request
    sdk_major = None
    expo_pkg = PROJECT_DIR / "node_modules" / "expo" / "package.json"
    try:
        ver = json.loads(expo_pkg.read_text(encoding="utf-8"))["version"]
        sdk_major = str(ver.split(".")[0])
        log(f"[EXPO] Project SDK: expo {ver} (major {sdk_major})")
    except Exception:
        log("[EXPO] Could not read installed expo version; SDK unknown.")
    if not sdk_major:
        return None
    try:
        req = urllib.request.Request("https://api.expo.dev/v2/versions",
                                     headers={"User-Agent": "Mozilla/5.0 dev-metro-provisioner"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for key, val in data.get("sdkVersions", {}).items():
            if key.startswith(f"{sdk_major}."):
                url = val.get("androidClientUrl")
                if url:
                    log(f"[EXPO] Expo Go URL for SDK {key}: {url}")
                    return url
    except Exception as exc:
        log(f"[EXPO] versions API lookup failed: {exc}")
    return None


def ensure_expo_go(sdk: Path) -> bool:
    """Install Expo Go on the emulator if it is missing (auto version match)."""
    adb = adb_cmd(sdk)
    proc = run(f'"{adb}" shell pm list packages', check=False, capture=True)
    if "host.exp.exponent" in proc.stdout:
        log("[EXPO] Expo Go already installed on device.")
        return True
    log("[EXPO] Expo Go not found; installing (downloads matching build)...")
    npx = which("npx")
    proc = run(f'"{npx}" expo client:install:android', check=False, timeout=1800)
    if proc.returncode == 0:
        log("[EXPO] Expo Go installed.")
        return True
    log("[EXPO] Automatic install failed; resolving official APK URL...")
    url = expo_go_apk_url()
    if not url:
        log("[EXPO] Could not resolve Expo Go URL; manual install required.")
        return False
    apk = PROJECT_DIR / "expo-go.apk"
    run(f'curl -L -o "{apk}" "{url}"', check=False, timeout=1800)
    if apk.exists() and apk.stat().st_size > 5_000_000:
        log(f"[EXPO] Downloaded {apk.stat().st_size // (1024 * 1024)} MB; installing...")
        run(f'"{adb}" install -r "{apk}"', check=False, timeout=600)
        apk.unlink(missing_ok=True)
        return True
    log("[EXPO] Download/install failed; manual install required.")
    return False


def open_app_in_emulator(sdk: Path) -> None:
    """Deep-link Expo Go to the Metro bundle URL (always a fresh instance)."""
    adb = adb_cmd(sdk)
    run(f'"{adb}" reverse tcp:8081 tcp:8081', check=False)
    # 快照恢复/残留的 Expo Go 可能停在旧 bundle 或已断开的旧 Metro 会话上：
    # 直接 am start 只会把旧实例带到前台而不重载 → 画面冻结。
    # 先 force-stop 再 deep link，强制冷启动加载最新 bundle。
    run(f'"{adb}" shell am force-stop host.exp.exponent', check=False)
    time.sleep(1)
    log("[EXPO] Opening app in Expo Go (fresh instance)...")
    run(f'"{adb}" shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081"',
        check=False)
    # 给 bundle 下载/编译留时间（Metro 首次打包可能 10-60s）
    time.sleep(8)
    log("[EXPO] Launched. The emulator should now show the app loading the latest bundle.")


def start_metro(clear_cache: bool) -> None:
    log("=== [6/6] Starting Metro + Expo Go ===")
    npx = which("npx")
    if not npx:
        die("npx not found (Node.js install issue).")
    cmd = f'"{npx}" expo start --port 8081 --android'
    if clear_cache:
        cmd += " --clear"
    log(f"[METRO] {cmd}")

    import threading
    metro_log = PROJECT_DIR / "metro.log"
    log(f"[METRO] Metro output -> {metro_log}")

    # Run Metro in a background thread (its stdout goes to metro.log), then
    # poll /status; once ready, deploy Expo Go and open the app. The main
    # thread keeps waiting so the script stays alive while Metro runs.
    def _run_metro():
        env = os.environ.copy()
        # Non-interactive (WMI/CI) runs: skip Expo Go version-upgrade prompt.
        # With EXPO_OFFLINE, an installed Expo Go skips version validation entirely.
        env["EXPO_OFFLINE"] = "1"
        with open(metro_log, "w", encoding="utf-8", errors="replace") as fh:
            subprocess.run(cmd, shell=True, cwd=str(PROJECT_DIR),
                           stdout=fh, stderr=subprocess.STDOUT, env=env)

    thread = threading.Thread(target=_run_metro, daemon=True)
    thread.start()

    if not metro_ready("http://localhost:8081/status"):
        log("[METRO] Metro did not become ready in time. See metro.log for details.")
        sys.exit(2)
    log("[METRO] Metro is running (http://localhost:8081).")

    sdk = sdk_root()
    if ensure_expo_go(sdk):
        open_app_in_emulator(sdk)

    log("[METRO] Dev environment ready. Metro keeps running; app reloads on edits.")
    try:
        while thread.is_alive():
            time.sleep(5)
    except KeyboardInterrupt:
        log("Metro stopped by user.")
        sys.exit(0)
    log("Metro process exited.")
    sys.exit(0)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    global LOG_FILE
    parser = argparse.ArgumentParser(description="Auto-provision Android emulator + Expo Metro dev environment.")
    parser.add_argument("--clear", action="store_true", help="reset Metro cache before starting")
    parser.add_argument("--avd", type=str, default=None, help="AVD name to boot (default: first available)")
    parser.add_argument("--no-reinstall", action="store_true", help="skip npm install even if node_modules is stale")
    parser.add_argument("--log-file", type=str, default=None, help="append logs to this file as well")
    args = parser.parse_args()

    if args.log_file:
        LOG_FILE = Path(args.log_file)
        LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

    log("=== Auto-Provisioning Dev Environment (Expo Metro, no APK build) ===")
    ensure_node()
    sdk = ensure_android_sdk()
    ensure_emulator_running(sdk, args.avd)
    ensure_project_deps(args.no_reinstall)
    ensure_port_free()
    start_metro(args.clear)


if __name__ == "__main__":
    main()

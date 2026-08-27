import os
import sys
import time
import subprocess
import shutil
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent

def log(msg):
    timestamp = time.strftime("%H:%M:%S")
    print(f"[{timestamp}] {msg}", flush=True)

def locate_android_tools():
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    platform_tools = Path(local_app_data) / "Android" / "Sdk" / "platform-tools"
    emulator_tools = Path(local_app_data) / "Android" / "Sdk" / "emulator"

    adb_path = None
    if (platform_tools / "adb.exe").exists():
        adb_path = str(platform_tools / "adb.exe")
        if str(platform_tools) not in os.environ.get("PATH", ""):
            os.environ["PATH"] += os.pathsep + str(platform_tools)
            log(f"[ENV] Found and added ADB to PATH: {platform_tools}")
    else:
        adb_path = shutil.which("adb")

    emulator_path = None
    # Prioritize the modern emulator folder over legacy tools in PATH
    if (emulator_tools / "emulator.exe").exists():
        emulator_path = str(emulator_tools / "emulator.exe")
        if str(emulator_tools) not in os.environ.get("PATH", ""):
            os.environ["PATH"] += os.pathsep + str(emulator_tools)
            log(f"[ENV] Found and added modern Emulator to PATH: {emulator_tools}")
    else:
        emulator_path = shutil.which("emulator")

    # Double check standard paths if not found
    if not adb_path:
        adb_path = shutil.which("adb")
    if not emulator_path:
        emulator_path = shutil.which("emulator")

    return adb_path, emulator_path

def is_device_usable(adb_path, device_id):
    try:
        # Check boot completion status
        res = subprocess.run(
            [adb_path, "-s", device_id, "shell", "getprop", "sys.boot_completed"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if res.returncode == 0 and "1" in res.stdout:
            return True
    except subprocess.TimeoutExpired:
        log(f"[ENV] Device {device_id} is unresponsive (timeout).")
    except Exception as e:
        log(f"[ENV] Error checking device status: {e}")
    return False

def kill_running_emulators():
    log("[ENV] Attempting to clean up unresponsive emulators/adb processes...")
    try:
        if sys.platform == "win32":
            subprocess.run("taskkill /f /im emulator.exe", shell=True, capture_output=True)
            subprocess.run("taskkill /f /im qemu-system-x86_64.exe", shell=True, capture_output=True)
            subprocess.run("adb kill-server", shell=True, capture_output=True)
        else:
            subprocess.run("killall -9 qemu-system-x86_64 emulator", shell=True, capture_output=True)
            subprocess.run("adb kill-server", shell=True, capture_output=True)
        time.sleep(3)
    except Exception as e:
        log(f"[WARNING] Error cleaning up processes: {e}")

def check_and_prepare_emulator(adb_path, emulator_path):
    if not adb_path:
        log("[ERROR] adb.exe could not be found. Please install Android SDK or add it to PATH.")
        sys.exit(1)

    log("[ENV] Auditing connected Android devices...")
    # Ensure ADB server is running
    subprocess.run([adb_path, "start-server"], capture_output=True)

    res = subprocess.run([adb_path, "devices"], capture_output=True, text=True)
    lines = [line.strip() for line in res.stdout.splitlines() if line.strip()]
    devices = [line.split()[0] for line in lines[1:] if "device" in line and "offline" not in line]

    usable_found = False
    for device in devices:
        log(f"[ENV] Found active device entry: {device}. Verifying responsiveness...")
        if is_device_usable(adb_path, device):
            log(f"[ENV] Emulator/Device {device} is healthy and ready to use.")
            usable_found = True
            break
        else:
            log(f"[ENV] Device {device} is offline or unresponsive.")

    if usable_found:
        return True

    # If any offline/unusable emulator is present, clean it up
    if lines[1:]:
        log("[ENV] Detected unusable device entries. Killing unresponsive instances...")
        kill_running_emulators()
        # Restart server
        subprocess.run([adb_path, "start-server"], capture_output=True)

    # Launch Emulator
    if not emulator_path:
        log("[ERROR] emulator.exe could not be found. Cannot launch AVD.")
        sys.exit(1)

    log("[ENV] Listing available Android Virtual Devices (AVD)...")
    avd_res = subprocess.run([emulator_path, "-list-avds"], capture_output=True, text=True)
    avds = [a.strip() for a in avd_res.stdout.splitlines() if a.strip()]

    if not avds:
        log("[ERROR] No AVDs available in your Android SDK configuration. Please create an AVD in Android Studio.")
        sys.exit(1)

    selected_avd = avds[0]
    log(f"[ENV] Launching AVD: {selected_avd}...")
    
    emulator_dir = str(Path(emulator_path).parent)
    sdk_path = str(Path(emulator_path).parent.parent)

    env = os.environ.copy()
    env["ANDROID_HOME"] = sdk_path
    env["ANDROID_SDK_ROOT"] = sdk_path

    if sys.platform == "win32":
        subprocess.Popen(
            [emulator_path, "-avd", selected_avd],
            cwd=emulator_dir,
            env=env,
            creationflags=subprocess.CREATE_NEW_CONSOLE
        )
    else:
        subprocess.Popen(
            [emulator_path, "-avd", selected_avd],
            cwd=emulator_dir,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

    log("[ENV] Waiting for emulator connection...")
    subprocess.run([adb_path, "wait-for-device"])

    log("[ENV] Emulator connected! Waiting for Android system boot completion...")
    for _ in range(30):
        res = subprocess.run([adb_path, "shell", "getprop", "sys.boot_completed"], capture_output=True, text=True)
        if "1" in res.stdout:
            log("[ENV] Emulator has successfully booted and is ready.")
            return True
        time.sleep(4)

    log("[WARNING] Emulator took too long to report boot completion. Attempting to proceed anyway...")
    return True

def mount_and_launch_apk(adb_path, apk_path):
    apk_file = Path(apk_path)
    if not apk_file.exists():
        log(f"[ERROR] Specified APK file does not exist: {apk_file}")
        sys.exit(1)

    log(f"[MOUNT] Installing APK to emulator: {apk_file.name}...")
    # Perform install
    install_res = subprocess.run([adb_path, "install", "-r", str(apk_file)], capture_output=True, text=True)
    log(f"[MOUNT] Installation output: {install_res.stdout.strip() or install_res.stderr.strip()}")

    log("[MOUNT] Launching application on emulator...")
    # List of possible package names to try launching
    packages_to_try = [
        "com.richardchung.doctormeetslawyer",
        "com.anonymous.doctormeetslawyer",
        "com.anonymous.doctor-meets-lawyer"
    ]
    
    launched_successfully = False
    for pkg in packages_to_try:
        launch_res = subprocess.run(
            [adb_path, "shell", "monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1"],
            capture_output=True,
            text=True
        )
        if launch_res.returncode == 0:
            log(f"[SUCCESS] App launched successfully using package: {pkg}!")
            launched_successfully = True
            break

    if not launched_successfully:
        log("[WARNING] Could not launch application using standard package IDs. The app is installed; please open it manually on your screen.")

def main():
    log("=== Android Emulator Mounting and Deployment Tool ===")
    
    # Check args
    if len(sys.argv) > 1:
        apk_path = sys.argv[1]
    else:
        # Scan for the absolute newest modified .apk file in build_downloads/ and android/app/build/
        apk_candidates = []
        
        # 1. Check CI download directory
        download_dir = PROJECT_DIR / "build_downloads"
        if download_dir.exists():
            apk_candidates.extend(download_dir.glob("**/*.apk"))
            
        # 2. Check local native Android build outputs
        local_build_dir = PROJECT_DIR / "android" / "app" / "build"
        if local_build_dir.exists():
            apk_candidates.extend(local_build_dir.glob("**/*.apk"))
            
        if apk_candidates:
            # Sort all candidate APKs by modification time descending (newest first)
            apk_candidates.sort(key=lambda x: x.stat().st_mtime, reverse=True)
            apk_path = str(apk_candidates[0])
            log(f"[ENV] Auto-detected latest compiled APK: {apk_candidates[0].relative_to(PROJECT_DIR)}")
        else:
            # Absolute fallback
            apk_path = str(download_dir / "app-release.apk")

    # Locate adb and emulator
    adb_path, emulator_path = locate_android_tools()

    # Audit & boot emulator
    check_and_prepare_emulator(adb_path, emulator_path)

    # Deploy APK
    mount_and_launch_apk(adb_path, apk_path)

if __name__ == "__main__":
    main()

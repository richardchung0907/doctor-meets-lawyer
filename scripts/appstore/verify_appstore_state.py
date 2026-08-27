#!/usr/bin/env python3
"""
Verify App Store Connect Real-Time Backend State
================================================
Checks attached build and screenshot count across all localizations.
"""

import os
import sys
import time
import requests
import jwt

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))
os.chdir(PROJECT_DIR)

# Fix Windows console UTF-8 printing
if sys.platform.startswith('win'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

KEYS_FILE = "keys.txt"
KEY_P8_FILE = os.path.join("ios-signing", "AuthKey_LSLS88W574.p8")

def load_keys():
    keys = {}
    with open(KEYS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            if ":" in line:
                k, v = line.split(":", 1)
                keys[k.strip()] = v.strip()
    return keys

def main():
    keys = load_keys()
    with open(KEY_P8_FILE, "r", encoding="utf-8") as f:
        private_key = f.read()

    headers = {"alg": "ES256", "kid": keys["Key ID for App Store Connect API"], "typ": "JWT"}
    payload = {"iss": keys["Issuer ID for App Store Connect API"], "exp": int(time.time()) + 1200, "aud": "appstoreconnect-v1"}
    token = jwt.encode(payload, private_key, algorithm="ES256", headers=headers)

    app_id = "6804181628"
    req_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    print("==========================================================")
    print("  Real-Time App Store Connect Backend Verification Check  ")
    print("==========================================================\n")

    # 1. Check Attached Build on Version 1.0
    ver_r = requests.get(f"https://api.appstoreconnect.apple.com/v1/apps/{app_id}/appStoreVersions?include=build", headers=req_headers)
    ver_data = ver_r.json().get("data", [])[0]
    ver_id = ver_data.get("id")

    attached_build = None
    if ver_r.json().get("included"):
        for inc in ver_r.json().get("included"):
            if inc.get("type") == "builds":
                attached_build = inc

    print(f"App Store Version: {ver_data.get('attributes', {}).get('versionString')}")
    if attached_build:
        b_attrs = attached_build.get("attributes", {})
        print(f" ✓ Attached Build: Version {b_attrs.get('version')} (BuildVersion: {b_attrs.get('buildVersion')}) | Uploaded: {b_attrs.get('uploadedDate')}")
    else:
        print(" ✗ No build attached to Version 1.0!")

    # 2. Check Screenshot Sets across Localizations
    locs_r = requests.get(f"https://api.appstoreconnect.apple.com/v1/appStoreVersions/{ver_id}/appStoreVersionLocalizations", headers=req_headers)
    locs = locs_r.json().get("data", [])

    print(f"\nChecking Screenshot Upload Status across {len(locs)} Localizations:")
    for loc in locs:
        loc_id = loc.get("id")
        locale = loc.get("attributes", {}).get("locale")

        ss_r = requests.get(f"https://api.appstoreconnect.apple.com/v1/appStoreVersionLocalizations/{loc_id}/appScreenshotSets", headers=req_headers)
        ss_sets = ss_r.json().get("data", [])

        set_info = []
        for sset in ss_sets:
            stype = sset.get("attributes", {}).get("screenshotDisplayType")
            shots_r = requests.get(f"https://api.appstoreconnect.apple.com/v1/appScreenshotSets/{sset.get('id')}/appScreenshots", headers=req_headers)
            count = len(shots_r.json().get("data", [])) if shots_r.status_code == 200 else 0
            set_info.append(f"{stype}: {count} image(s)")

        print(f" - Locale '{locale}': {', '.join(set_info)}")

    print("\n==========================================================")
    print("  ✓ Real-time Backend Verification Check Complete")
    print("==========================================================")

if __name__ == "__main__":
    main()

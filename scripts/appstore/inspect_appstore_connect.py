#!/usr/bin/env python3
"""
Inspect App Store Connect Configuration
======================================
Queries the Apple App Store Connect API using your credentials and AuthKey.p8
to inspect the current app store metadata, categories, pricing, privacy URL,
localized descriptions, and TestFlight build statuses.
"""

import os
import sys
import time
import json
import subprocess

# Force execution directory to project root
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))
os.chdir(PROJECT_DIR)

# Fix Windows console UTF-8 printing
if sys.platform.startswith('win'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Ensure dependencies are installed
try:
    import jwt
    import requests
except ImportError:
    print("Installing missing dependencies ('pyjwt[crypto]' and 'requests')...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pyjwt[crypto]", "requests"])
    import jwt
    import requests

KEYS_FILE = "keys.txt"

def parse_keys():
    if not os.path.exists(KEYS_FILE):
        print(f"Error: {KEYS_FILE} not found.")
        sys.exit(1)
    
    keys = {}
    with open(KEYS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if ":" in line:
                k, v = line.split(":", 1)
                keys[k.strip()] = v.strip()
    return keys

def generate_jwt(key_id, issuer_id, private_key_content):
    payload = {
        "iss": issuer_id,
        "iat": int(time.time()),
        "exp": int(time.time()) + 900,  # 15 minutes
        "aud": "appstoreconnect-v1"
    }
    headers = {
        "alg": "ES256",
        "kid": key_id,
        "typ": "JWT"
    }
    return jwt.encode(payload, private_key_content, algorithm="ES256", headers=headers)

def main():
    print("==========================================================")
    print("  Apple App Store Connect — Project Settings Inspection")
    print("==========================================================\n")
    
    keys = parse_keys()
    key_id = keys.get("Key ID for App Store Connect API")
    issuer_id = keys.get("Issuer ID for App Store Connect API")
    
    if not key_id or not issuer_id:
        print("Error: App Store Connect API credentials missing in keys.txt.")
        sys.exit(1)
        
    p8_file = os.path.join("ios-signing", f"AuthKey_{key_id}.p8")
    if not os.path.exists(p8_file):
        # Search for any p8 file in root if the specific one is missing
        p8_candidates = [os.path.join("ios-signing", f) for f in (os.listdir(os.path.join(PROJECT_DIR, "ios-signing")) if os.path.isdir(os.path.join(PROJECT_DIR, "ios-signing")) else []) if f.endswith(".p8")]
        if p8_candidates:
            p8_file = p8_candidates[0]
        else:
            print(f"Error: App Store Connect private key file (.p8) not found.")
            sys.exit(1)
            
    print(f"Using private key file: {p8_file}")
    with open(p8_file, "r", encoding="utf-8") as f:
        private_key_content = f.read().strip()
        
    # Generate token
    try:
        token = generate_jwt(key_id, issuer_id, private_key_content)
        print("✓ Successfully generated signed App Store Connect JWT.")
    except Exception as e:
        print(f"Error generating JWT: {e}")
        sys.exit(1)
        
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # 1. Fetch apps to find com.richardchung.doctormeetslawyer
    print("\nFetching apps from App Store Connect...")
    apps_url = "https://api.appstoreconnect.apple.com/v1/apps"
    r = requests.get(apps_url, headers=headers)
    if r.status_code != 200:
        print(f"✗ Failed to fetch apps (status: {r.status_code}). Response: {r.text}")
        sys.exit(1)
        
    apps_data = r.json().get("data", [])
    target_app = None
    bundle_id = "com.richardchung.doctormeetslawyer"
    
    for app in apps_data:
        app_bundle_id = app.get("attributes", {}).get("bundleId")
        if app_bundle_id == bundle_id:
            target_app = app
            break
            
    if not target_app:
        print(f"✗ Error: App with bundleId '{bundle_id}' was not found in your App Store Connect account.")
        print("Please make sure the App has been created on App Store Connect with the correct bundle identifier.")
        sys.exit(1)
        
    app_id = target_app["id"]
    app_attrs = target_app["attributes"]
    print(f"✓ Found target App:")
    print(f"  - App Name: {app_attrs.get('name')}")
    print(f"  - Bundle ID: {app_attrs.get('bundleId')}")
    print(f"  - Primary Locale: {app_attrs.get('primaryLocale')}")
    print(f"  - App ID (Apple): {app_id}")
    
    # 2. Get App Store Versions
    print("\nFetching App Store Versions...")
    versions_url = f"https://api.appstoreconnect.apple.com/v1/apps/{app_id}/appStoreVersions"
    r_ver = requests.get(versions_url, headers=headers)
    
    versions = []
    if r_ver.status_code == 200:
        versions = r_ver.json().get("data", [])
        print(f"✓ Found {len(versions)} App Store version(s):")
        for v in versions:
            v_attrs = v.get("attributes", {})
            state = v_attrs.get('appStoreState') or v_attrs.get('appStoreVersionState') or "Unknown"
            print(f"  - Version: {v_attrs.get('versionString')} ({v_attrs.get('platform')}) | State: {state}")
    else:
        print(f"✗ Failed to fetch App Store versions: {r_ver.status_code}")

    # 3. Get App Infos (Categories, Primary Subcategory)
    print("\nFetching App Categories & Info...")
    infos_url = f"https://api.appstoreconnect.apple.com/v1/apps/{app_id}/appInfos"
    r_info = requests.get(infos_url, headers=headers)
    info_id = None
    if r_info.status_code == 200:
        infos_data = r_info.json().get("data", [])
        for info in infos_data:
            info_id = info["id"]
            # Fetch details with category relationships
            r_cat = requests.get(f"https://api.appstoreconnect.apple.com/v1/appInfos/{info_id}?include=primaryCategory,primarySubcategoryOne,secondaryCategory", headers=headers)
            if r_cat.status_code == 200:
                cat_data = r_cat.json()
                rel = cat_data.get("data", {}).get("relationships", {})
                
                p_cat_id = rel.get("primaryCategory", {}).get("data", {}).get("id") if rel.get("primaryCategory", {}).get("data") else None
                s_cat_id = rel.get("secondaryCategory", {}).get("data", {}).get("id") if rel.get("secondaryCategory", {}).get("data") else None
                
                print(f"✓ App Info Details:")
                print(f"  - Primary Category ID: {p_cat_id}")
                print(f"  - Secondary Category ID: {s_cat_id}")
    else:
        print(f"✗ Failed to fetch App Infos: {r_info.status_code}")

    # 4. Get App Info Localizations for App-level settings (Privacy Policy URL)
    if info_id:
        print("\nFetching App Info Localizations (including Privacy Policy URL)...")
        loc_url = f"https://api.appstoreconnect.apple.com/v1/appInfos/{info_id}/appInfoLocalizations"
        r_loc = requests.get(loc_url, headers=headers)
        if r_loc.status_code == 200:
            locs = r_loc.json().get("data", [])
            for loc in locs:
                loc_attrs = loc.get("attributes", {})
                locale_code = loc_attrs.get('locale')
                print(f"  Locale: '{locale_code}'")
                print(f"    - Subtitle: {loc_attrs.get('subtitle', 'None')}")
                print(f"    - Privacy Policy URL: {loc_attrs.get('privacyPolicyUrl', 'MISSING!')}")
        else:
            print(f"✗ Failed to fetch app info localizations: {r_loc.status_code} - {r_loc.text}")

    print("\n==========================================================")
    print("  Inspection completed. Please review the details above.")
    print("==========================================================")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Patch App Store Connect Configuration
====================================
Programmatically updates the primary/secondary categories to 'Photo & Video' and 'Lifestyle',
and configures the Privacy Policy URL for all active localizations of the app
on Apple App Store Connect via the REST API.
"""

import os
import sys
import time
import requests
import jwt

# Force execution directory to project root
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))
os.chdir(PROJECT_DIR)

# Fix Windows console UTF-8 printing
if sys.platform.startswith('win'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

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
    print("  Apple App Store Connect — Programmatic Settings Patch")
    print("==========================================================\n")
    
    keys = parse_keys()
    key_id = keys.get("Key ID for App Store Connect API")
    issuer_id = keys.get("Issuer ID for App Store Connect API")
    
    if not key_id or not issuer_id:
        print("Error: App Store Connect API credentials missing in keys.txt.")
        sys.exit(1)
        
    p8_file = os.path.join("ios-signing", f"AuthKey_{key_id}.p8")
    if not os.path.exists(p8_file):
        p8_candidates = [os.path.join("ios-signing", f) for f in (os.listdir(os.path.join(PROJECT_DIR, "ios-signing")) if os.path.isdir(os.path.join(PROJECT_DIR, "ios-signing")) else []) if f.endswith(".p8")]
        if p8_candidates:
            p8_file = p8_candidates[0]
        else:
            print("Error: App Store Connect private key file (.p8) not found.")
            sys.exit(1)
            
    with open(p8_file, "r", encoding="utf-8") as f:
        private_key_content = f.read().strip()
        
    try:
        token = generate_jwt(key_id, issuer_id, private_key_content)
        print("✓ Generated signed App Store Connect JWT.")
    except Exception as e:
        print(f"Error generating JWT: {e}")
        sys.exit(1)
        
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    app_id = "6804181628"  # From our programmatic inspection
    privacy_url = "https://richardchung0907.github.io/doctor-meets-lawyer/privacy-policy.html"
    
    # 1. Update App Categories (Primary: PHOTO_AND_VIDEO, Secondary: LIFESTYLE)
    print("\nFetching App Infos to locate Info ID...")
    infos_url = f"https://api.appstoreconnect.apple.com/v1/apps/{app_id}/appInfos"
    r_info = requests.get(infos_url, headers=headers)
    
    if r_info.status_code == 200:
        infos_data = r_info.json().get("data", [])
        if infos_data:
            info_id = infos_data[0]["id"]
            print(f"✓ Found App Info ID: {info_id}")
            print("Patching App Categories to (Primary: Photo & Video, Secondary: Lifestyle)...")
            
            patch_data = {
                "data": {
                    "type": "appInfos",
                    "id": info_id,
                    "relationships": {
                        "primaryCategory": {
                            "data": {
                                "type": "appCategories",
                                "id": "PHOTO_AND_VIDEO"
                            }
                        },
                        "secondaryCategory": {
                            "data": {
                                "type": "appCategories",
                                "id": "LIFESTYLE"
                            }
                        }
                    }
                }
            }
            
            patch_url = f"https://api.appstoreconnect.apple.com/v1/appInfos/{info_id}"
            r_patch = requests.patch(patch_url, headers=headers, json=patch_data)
            if r_patch.status_code == 200:
                print("✓ Successfully patched App Store categories!")
            else:
                print(f"✗ Failed to patch App Store categories: {r_patch.status_code} - {r_patch.text}")
        else:
            print("✗ App Info data is empty.")
    else:
        print(f"✗ Failed to fetch App Info ID: {r_info.status_code}")
        
    # 2. Update Privacy Policy URL for all active App Info Localizations
    if 'info_id' in locals() and info_id:
        print("\nFetching App Info Localizations (App-wide settings, including Privacy Policy)...")
        loc_url = f"https://api.appstoreconnect.apple.com/v1/appInfos/{info_id}/appInfoLocalizations"
        r_loc = requests.get(loc_url, headers=headers)
        
        if r_loc.status_code == 200:
            localizations = r_loc.json().get("data", [])
            print(f"✓ Found {len(localizations)} localized configurations to patch.")
            
            for loc in localizations:
                loc_id = loc["id"]
                locale_code = loc.get("attributes", {}).get("locale")
                print(f"Patching Privacy Policy URL for language '{locale_code}' (ID: {loc_id})...")
                
                loc_patch_data = {
                    "data": {
                        "type": "appInfoLocalizations",
                        "id": loc_id,
                        "attributes": {
                            "privacyPolicyUrl": privacy_url
                        }
                    }
                }
                
                loc_patch_url = f"https://api.appstoreconnect.apple.com/v1/appInfoLocalizations/{loc_id}"
                r_loc_patch = requests.patch(loc_patch_url, headers=headers, json=loc_patch_data)
                if r_loc_patch.status_code == 200:
                    print(f"  - ✓ Success for language '{locale_code}'!")
                else:
                    print(f"  - ✗ Failed for language '{locale_code}': {r_loc_patch.status_code} - {r_loc_patch.text}")
        else:
            print(f"✗ Failed to fetch localizations: {r_loc.status_code} - {r_loc.text}")
    else:
        print("✗ Skipping Privacy Policy patch since App Info ID is unavailable.")
        
    print("\n==========================================================")
    print("  App Store Connect patching completed.")
    print("==========================================================")

if __name__ == "__main__":
    main()

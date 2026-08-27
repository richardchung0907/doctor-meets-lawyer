#!/usr/bin/env python3
"""
Get App Store Connect Categories
================================
Queries the /v1/appCategories endpoint of the App Store Connect API
to list all available categories and subcategories for iOS.
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

KEYS_FILE = "keys.txt"

def parse_keys():
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
        "exp": int(time.time()) + 900,
        "aud": "appstoreconnect-v1"
    }
    headers = {
        "alg": "ES256",
        "kid": key_id,
        "typ": "JWT"
    }
    return jwt.encode(payload, private_key_content, algorithm="ES256", headers=headers)

def main():
    keys = parse_keys()
    key_id = keys.get("Key ID for App Store Connect API")
    issuer_id = keys.get("Issuer ID for App Store Connect API")
    
    p8_file = os.path.join("ios-signing", f"AuthKey_{key_id}.p8")
    if not os.path.exists(p8_file):
        p8_candidates = [os.path.join("ios-signing", f) for f in (os.listdir(os.path.join(PROJECT_DIR, "ios-signing")) if os.path.isdir(os.path.join(PROJECT_DIR, "ios-signing")) else []) if f.endswith(".p8")]
        if p8_candidates:
            p8_file = p8_candidates[0]
            
    with open(p8_file, "r", encoding="utf-8") as f:
        private_key_content = f.read().strip()
        
    token = generate_jwt(key_id, issuer_id, private_key_content)
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    url = "https://api.appstoreconnect.apple.com/v1/appCategories?filter[platforms]=IOS&limit=200"
    r = requests.get(url, headers=headers)
    if r.status_code == 200:
        categories = r.json().get("data", [])
        print("Available iOS Categories:")
        for cat in categories:
            cat_attrs = cat.get("attributes", {})
            print(f"- ID: {cat['id']} | Name: {cat_attrs.get('name')}")
    else:
        print(f"Error: {r.status_code} - {r.text}")

if __name__ == "__main__":
    main()

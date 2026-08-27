#!/usr/bin/env python3
"""
Setup GitHub Action Secrets
===========================
Packages, encrypts, and uploads key properties, keystores, and credentials
from your local environment to GitHub Actions repository secrets using WMI,
Libsodium (pynacl), and the GitHub API.

Supports both Android and iOS signing credentials.
"""

import sys
import subprocess
import os
import base64

# Decouple script location from execution directory by forcing project root
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))
os.chdir(PROJECT_DIR)

# Fix Windows console UTF-8 printing
if sys.platform.startswith('win'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Automatically resolve dependencies
try:
    import requests
    import nacl.public
    import nacl.encoding
except ImportError:
    print("Required libraries ('requests' or 'pynacl') are missing. Installing them now...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "requests", "pynacl"])
        import requests
        import nacl.public
        import nacl.encoding
        print("Successfully installed 'requests' and 'pynacl'.\n")
    except Exception as e:
        print(f"Failed to install dependencies automatically: {e}")
        print("Please run: pip install requests pynacl")
        sys.exit(1)

# Configuration
REPO_OWNER = "richardchung0907"
REPO_NAME = "doctor-meets-lawyer"
KEYS_FILE = "keys.txt"

# Android Files
KEY_PROPERTIES_FILE = os.path.join("android", "key.properties")
KEYSTORE_FILE = os.path.join("android", "app", "upload-keystore.jks")

# iOS Files
CERTIFICATE_FILE = os.path.join("ios-signing", "certificates.p12")
PROVISIONING_PROFILE_FILE = os.path.join("ios-signing", "doctor_meets_lawyer_app_store.mobileprovision")  # TODO: create this project App Store profile first, then drop it into ios-signing/ under this exact filename
APPSTORE_CONNECT_KEY_FILE = os.path.join("ios-signing", "AuthKey_LSLS88W574.p8")

def parse_keys_file():
    if not os.path.exists(KEYS_FILE):
        print(f"Error: {KEYS_FILE} not found in current directory.")
        sys.exit(1)
    
    keys = {}
    with open(KEYS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if ":" in line:
                key, value = line.split(":", 1)
                keys[key.strip()] = value.strip()
    return keys

def get_file_content_base64(file_path):
    if not os.path.exists(file_path):
        print(f"Error: Required file not found: {file_path}")
        sys.exit(1)
    with open(file_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def get_text_file_content(file_path):
    if not os.path.exists(file_path):
        print(f"Error: Required file not found: {file_path}")
        sys.exit(1)
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read().strip()

def encrypt_secret(public_key_b64: str, secret_value: str) -> str:
    """Encrypt a Unicode string using the libsodium SealedBox algorithm as required by GitHub."""
    public_key = nacl.public.PublicKey(public_key_b64.encode("utf-8"), nacl.encoding.Base64Encoder())
    sealed_box = nacl.public.SealedBox(public_key)
    encrypted = sealed_box.encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(encrypted).decode("utf-8")

def upload_secret(token, secret_name, secret_value):
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    # 1. Get Public Key
    pub_key_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/actions/secrets/public-key"
    r = requests.get(pub_key_url, headers=headers)
    if r.status_code != 200:
        print(f"Failed to fetch public key from GitHub (status: {r.status_code}). Response: {r.text}")
        sys.exit(1)
    
    pub_key_data = r.json()
    key_id = pub_key_data["key_id"]
    public_key_b64 = pub_key_data["key"]
    
    # 2. Encrypt the secret
    encrypted_value = encrypt_secret(public_key_b64, secret_value)
    
    # 3. PUT encrypted secret
    secret_url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/actions/secrets/{secret_name}"
    payload = {
        "encrypted_value": encrypted_value,
        "key_id": key_id
    }
    
    put_r = requests.put(secret_url, headers=headers, json=payload)
    if put_r.status_code in [201, 204]:
        print(f"✓ Secret '{secret_name}' successfully configured on GitHub Actions.")
    else:
        print(f"✗ Failed to upload secret '{secret_name}' (status: {put_r.status_code}). Response: {put_r.text}")

def main():
    print("==========================================================")
    print("  RICHY Lite — GitHub Actions Android & iOS Build Setup")
    print("==========================================================\n")
    
    keys = parse_keys_file()
    token = keys.get("Github key")
    if not token:
        print("Error: Could not retrieve 'Github key' from keys.txt.")
        sys.exit(1)
    print("✓ Successfully retrieved GitHub PAT from keys.txt.")
    
    # --- 1. Android Secrets ---
    print("\n[Preparing Android Secrets]")
    if os.path.exists(KEY_PROPERTIES_FILE) and os.path.exists(KEYSTORE_FILE):
        key_properties_content = get_text_file_content(KEY_PROPERTIES_FILE)
        keystore_base64 = get_file_content_base64(KEYSTORE_FILE)
        print("✓ Loaded and prepared Android signing keys.")
        
        print("Uploading Android secrets to GitHub...")
        upload_secret(token, "ANDROID_KEY_PROPERTIES", key_properties_content)
        upload_secret(token, "ANDROID_KEYSTORE_BASE64", keystore_base64)
    else:
        print("⚠ Android signing files missing or skipped.")

    # --- 2. iOS Secrets ---
    print("\n[Preparing iOS Secrets]")
    
    cert_pwd = keys.get("IOS_BUILD_CERTIFICATE_PASSWORD")
    prof_name = keys.get("IOS_PROVISIONING_PROFILE_NAME")
    issuer_id = keys.get("Issuer ID for App Store Connect API")
    key_id = keys.get("Key ID for App Store Connect API")
    
    if not all([cert_pwd, prof_name, issuer_id, key_id]):
        print("Error: Some required iOS properties are missing from keys.txt.")
        sys.exit(1)
        
    cert_base64 = get_file_content_base64(CERTIFICATE_FILE)
    prov_profile_base64 = get_file_content_base64(PROVISIONING_PROFILE_FILE)
    appstore_key_content = get_text_file_content(APPSTORE_CONNECT_KEY_FILE)
    
    print("✓ Loaded and encoded all iOS certificates and profiles.")
    
    print("Uploading iOS secrets to GitHub...")
    upload_secret(token, "IOS_PROVISIONING_PROFILE_NAME", prof_name)
    upload_secret(token, "IOS_BUILD_CERTIFICATE_BASE64", cert_base64)
    upload_secret(token, "IOS_BUILD_CERTIFICATE_PASSWORD", cert_pwd)
    upload_secret(token, "IOS_PROVISIONING_PROFILE_BASE64", prov_profile_base64)
    upload_secret(token, "KEYCHAIN_PASSWORD", cert_pwd) # Reuse cert password for temporary runner keychain
    upload_secret(token, "APPSTORE_ISSUER_ID", issuer_id)
    upload_secret(token, "APPSTORE_KEY_ID", key_id)
    upload_secret(token, "APPSTORE_PRIVATE_KEY", appstore_key_content)

    print("\n==========================================================")
    print("  ✓ Setup successful! Your repository is now fully prepared")
    print("    for BOTH Android & iOS building on GitHub Actions.")
    print("==========================================================")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
App Store Connect Promotional Text Updater
===========================================
Updates 'promotionalText' (行銷宣傳文字) across all 10 localized languages in App Store Connect
with compelling, localized "Limited-Time Free" marketing copy.
Enforces 1.5s rate-limiting delays between requests.
"""

import os
import sys
import time
import json
import requests
import jwt

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))
os.chdir(PROJECT_DIR)

if sys.platform.startswith('win'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

KEYS_FILE = "keys.txt"
KEY_P8_FILE = os.path.join("ios-signing", "AuthKey_LSLS88W574.p8")
RATE_LIMIT_DELAY = 1.5

PROMO_TEXTS = {
    "zh-Hant": "【限時免費】韓式網紅超火濾鏡與復古膠片效果，一鍵雕琢極致質感美照，立即下載體驗！",
    "en-US": "[Limited-Time Free] Premium Korean aesthetic filters & vintage film presets. Transform your photos instantly!",
    "ja": "【期間限定無料】SNSで大人気の韓国風フィルター＆レトロフィルムエフェクト！ワンタップでエモい美写真をGET！",
    "zh-Hans": "【限时免费】韩式网红超火滤镜与复古胶片效果，一键雕琢极致质感美照，立即下载体验！",
    "de-DE": "[Zeitlich begrenzt KOSTENLOS] Premium koreanische Ästhetik-Filter & Vintage-Filmeffekte. Jetzt gratis ausprobieren!",
    "fr-FR": "[GRATUIT pour une durée limitée] Filtres coréens tendance & effets film rétro. Sublimez vos photos en un tap !",
    "es-ES": "[¡GRATIS por tiempo limitado!] Filtros estéticos coreanos y efectos de película retro. ¡Transforma tus fotos hoy!",
    "it": "[GRATIS per un tempo limitato] Filtri estetici coreani e effetti pellicola vintage. Trasforma le tue foto subito!",
    "ar-SA": "[مجاني لفترة محدودة] فلاتر جمالية كورية فاخرة وتأثيرات أفلام ريترو. حوّل صورك بلمسة واحدة الآن!",
    "ru": "[БЕСПЛАТНО на ограниченное время] Популярные корейские фильтры и винтажные эффекты. Создавайте шедевры в один клик!"
}

def load_keys():
    keys = {}
    with open(KEYS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and ":" in line:
                k, v = line.split(":", 1)
                keys[k.strip()] = v.strip()
    return keys

def generate_jwt_token(issuer_id, key_id, p8_path):
    with open(p8_path, "r", encoding="utf-8") as f:
        private_key = f.read()
    headers = {"alg": "ES256", "kid": key_id, "typ": "JWT"}
    payload = {"iss": issuer_id, "exp": int(time.time()) + 1200, "aud": "appstoreconnect-v1"}
    return jwt.encode(payload, private_key, algorithm="ES256", headers=headers)

def api_call(method, token, endpoint, params=None, json_data=None):
    time.sleep(RATE_LIMIT_DELAY)
    url = f"https://api.appstoreconnect.apple.com/v1/{endpoint}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    r = requests.request(method, url, headers=headers, params=params, json=json_data)
    return r

def main():
    print("==========================================================")
    print("  RICHY Lite — Update App Store Connect Promotional Texts ")
    print("==========================================================\n")

    keys = load_keys()
    token = generate_jwt_token(keys["Issuer ID for App Store Connect API"], keys["Key ID for App Store Connect API"], KEY_P8_FILE)
    app_id = "6792005935"

    # 1. Fetch Version ID
    ver_r = api_call("GET", token, f"apps/{app_id}/appStoreVersions")
    if ver_r.status_code != 200:
        print(f"Error fetching appStoreVersions ({ver_r.status_code}): {ver_r.text}")
        sys.exit(1)

    ver_data = ver_r.json().get("data", [])[0]
    ver_id = ver_data.get("id")
    ver_str = ver_data.get("attributes", {}).get("versionString")
    print(f"Target Version: {ver_str} (ID: {ver_id})")

    # 2. Fetch Localizations
    locs_r = api_call("GET", token, f"appStoreVersions/{ver_id}/appStoreVersionLocalizations")
    if locs_r.status_code != 200:
        print(f"Error fetching localizations ({locs_r.status_code}): {locs_r.text}")
        sys.exit(1)

    locs = locs_r.json().get("data", [])
    print(f"Found {len(locs)} localized version records.\n")

    updated_count = 0
    for loc in locs:
        loc_id = loc.get("id")
        locale = loc.get("attributes", {}).get("locale")
        promo_text = PROMO_TEXTS.get(locale, PROMO_TEXTS["en-US"])

        print(f"Updating Promotional Text for locale '{locale}'...")
        print(f"  Copy: '{promo_text}'")

        payload = {
            "data": {
                "type": "appStoreVersionLocalizations",
                "id": loc_id,
                "attributes": {
                    "promotionalText": promo_text
                }
            }
        }

        res = api_call("PATCH", token, f"appStoreVersionLocalizations/{loc_id}", json_data=payload)
        if res.status_code == 200:
            print(f"  ✓ Successfully updated promotionalText for '{locale}'\n")
            updated_count += 1
        else:
            print(f"  ✗ Failed to update '{locale}' ({res.status_code}): {res.text}\n")

    print("==========================================================")
    print(f"  ✓ Completed! Updated promotional text for {updated_count}/{len(locs)} localizations.")
    print("==========================================================")

if __name__ == "__main__":
    main()

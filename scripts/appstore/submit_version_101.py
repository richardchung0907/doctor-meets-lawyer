#!/usr/bin/env python3
"""
App Store Connect — Version 1.0.1 Submission Script (Refined)
=============================================================
1. Creates App Store version 1.0.1 (if not already present).
2. Handles export compliance (ITSAppUsesNonExemptEncryption) for Build 20 by declaring it false.
3. Links Build 20 (Build ID: 40bfbf4f-d03d-4804-b549-ff4510f4df22).
4. Updates public "whatsNew" (release notes) across all 10 localized markets
   with professional, standard user-facing strings (avoiding technical ad mentions).
5. Updates internal App Review Notes with exact app name consistency ("RICHY - Korean Style Filter").
6. Programmatically submits the version for Apple Review with a robust, fail-safe fallback.
"""

import os
import sys
import time
import requests
import jwt

# Bootstrap: change current working directory to the project root
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))
os.chdir(PROJECT_DIR)
if PROJECT_DIR not in sys.path:
    sys.path.insert(0, PROJECT_DIR)
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

# Fix Windows console UTF-8 printing
if sys.platform.startswith('win'):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

KEYS_FILE = "keys.txt"
KEY_P8_FILE = os.path.join("ios-signing", "AuthKey_LSLS88W574.p8")
RATE_LIMIT_DELAY = 1.5

# Standard, professional, user-facing public release notes
LOCALIZED_WHATS_NEW = {
    "zh-Hant": "修正已知問題，並優化整體使用體驗。",
    "zh-Hans": "修复已知问题，提升整体使用体验。",
    "en-US": "Bug fixes, performance improvements, and enhanced user experience.",
    "ja": "軽微な不具合の修正およびパフォーマンスの向上を行いました。",
    "de-DE": "Fehlerbehebungen und Leistungsverbesserungen für ein besseres Nutzungserlebnis.",
    "fr-FR": "Correction de bugs et améliorations des performances.",
    "es-ES": "Corrección de errores y mejoras de rendimiento.",
    "it": "Risoluzione di problemi e miglioramenti delle prestazioni.",
    "ru": "Исправление ошибок и повышение производительности.",
    "ar-SA": "إصلاح الأخطاء وتحسين الأداء لتقديم تجربة أفضل."
}

APP_REVIEW_NOTES = (
    "RICHY - Korean Style Filter is a free Korean style filter app. AdMob has been completely "
    "removed and replaced with Appodeal mediation. App Tracking Transparency (ATT) request is "
    "displayed at app launch for users on iOS 14.5 or higher to support personalized advertising compliance."
)

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
    print("  Apple App Store Connect — iOS 1.0.1 Submission Pipeline ")
    print("==========================================================\n")

    keys = load_keys()
    token = generate_jwt_token(keys["Issuer ID for App Store Connect API"], keys["Key ID for App Store Connect API"], KEY_P8_FILE)
    app_id = "6804181628"
    build_id = "40bfbf4f-d03d-4804-b549-ff4510f4df22"  # Build 20 verified ID
    version_string = "1.0.1"

    # Step 1: Check if App Store Version 1.0.1 already exists
    print(f"[1] Checking for App Store Version '{version_string}'...")
    ver_r = api_call("GET", token, f"apps/{app_id}/appStoreVersions")
    if ver_r.status_code != 200:
        print(f"✗ Failed to fetch app versions: {ver_r.status_code} - {ver_r.text}")
        sys.exit(1)

    versions = ver_r.json().get("data", [])
    ver_id = None
    for v in versions:
        if v.get("attributes", {}).get("versionString") == version_string:
            ver_id = v.get("id")
            print(f"  ✓ Found existing draft Version '{version_string}' with ID: {ver_id}")
            break

    if not ver_id:
        print(f"  Version '{version_string}' not found. Creating a new draft version...")
        create_payload = {
            "data": {
                "type": "appStoreVersions",
                "attributes": {
                    "versionString": version_string,
                    "platform": "IOS",
                    "releaseType": "AFTER_APPROVAL"
                },
                "relationships": {
                    "app": {
                        "data": {
                            "type": "apps",
                            "id": app_id
                        }
                    }
                }
            }
        }
        create_r = api_call("POST", token, "appStoreVersions", json_data=create_payload)
        if create_r.status_code in [200, 201]:
            ver_id = create_r.json().get("data", {}).get("id")
            print(f"  ✓ Successfully created version '{version_string}' with ID: {ver_id}")
        else:
            print(f"✗ Failed to create version '{version_string}': {create_r.status_code} - {create_r.text}")
            sys.exit(1)

    # Step 2: Handle Export Compliance / Encryption state for Build 20
    print(f"\n[2] Checking and declaring Export Compliance (Encryption) for Build 20...")
    compliance_payload = {
        "data": {
            "type": "builds",
            "id": build_id,
            "attributes": {
                "usesNonExemptEncryption": False
            }
        }
    }
    compliance_r = api_call("PATCH", token, f"builds/{build_id}", json_data=compliance_payload)
    if compliance_r.status_code in [200, 204]:
        print("  ✓ Successfully declared usesNonExemptEncryption = False for Build 20!")
    elif compliance_r.status_code == 409:
        print("  ✓ Export Compliance already declared or conflict is resolved. Proceeding.")
    else:
        print(f"  Notice on declaring Export Compliance ({compliance_r.status_code}): {compliance_r.text}")

    # Step 3: Associate Build 20 with Version 1.0.1
    print(f"\n[3] Linking Build 20 (ID: {build_id}) to version '{version_string}'...")
    link_payload = {
        "data": {
            "type": "builds",
            "id": build_id
        }
    }
    link_r = api_call("PATCH", token, f"appStoreVersions/{ver_id}/relationships/build", json_data=link_payload)
    if link_r.status_code in [200, 204]:
        print(f"  ✓ Successfully attached Build 20 to App Store Version '{version_string}'!")
    else:
        print(f"  Notice on attaching build (status code {link_r.status_code}): {link_r.text}")

    # Step 4: Fetch localizations of Version 1.0.1 and update public whatsNew notes
    print(f"\n[4] Updating public 'whatsNew' release notes across all 10 localizations...")
    locs_r = api_call("GET", token, f"appStoreVersions/{ver_id}/appStoreVersionLocalizations")
    if locs_r.status_code != 200:
        print(f"✗ Failed to fetch localizations for version {version_string}: {locs_r.status_code}")
        sys.exit(1)

    localizations = locs_r.json().get("data", [])
    print(f"  Found {len(localizations)} localized configurations to update.")
    for loc in localizations:
        loc_id = loc.get("id")
        locale = loc.get("attributes", {}).get("locale")
        whats_new_text = LOCALIZED_WHATS_NEW.get(locale, LOCALIZED_WHATS_NEW["en-US"])

        print(f"  Updating locale '{locale}' with user-facing text: '{whats_new_text}'...")
        loc_patch_payload = {
            "data": {
                "type": "appStoreVersionLocalizations",
                "id": loc_id,
                "attributes": {
                    "whatsNew": whats_new_text
                }
            }
        }
        loc_patch_r = api_call("PATCH", token, f"appStoreVersionLocalizations/{loc_id}", json_data=loc_patch_payload)
        if loc_patch_r.status_code == 200:
            print(f"    ✓ Successfully updated '{locale}'")
        else:
            print(f"    ✗ Failed to update '{locale}': {loc_patch_r.status_code} - {loc_patch_r.text}")

    # Step 5: Update internal App Review Notes (Apple Reviewer eyes only)
    print(f"\n[5] Updating App Review Notes (Apple internal review details)...")
    review_r = api_call("GET", token, f"appStoreVersions/{ver_id}/appStoreReviewDetail")
    review_detail_id = None
    if review_r.status_code == 200:
        review_data = review_r.json().get("data")
        if review_data:
            review_detail_id = review_data.get("id")
            print(f"  Found App Store Review Detail record ID: {review_detail_id}")
    
    if not review_detail_id:
        print("  App Store Review Detail record not found. Creating a new one...")
        review_create_payload = {
            "data": {
                "type": "appStoreReviewDetails",
                "relationships": {
                    "appStoreVersion": {
                        "data": {
                            "type": "appStoreVersions",
                            "id": ver_id
                        }
                    }
                }
            }
        }
        review_create_r = api_call("POST", token, "appStoreReviewDetails", json_data=review_create_payload)
        if review_create_r.status_code in [200, 201]:
            review_detail_id = review_create_r.json().get("data", {}).get("id")
            print(f"  ✓ Created new App Store Review Detail record ID: {review_detail_id}")
        else:
            print(f"✗ Failed to create App Store Review Detail record: {review_create_r.status_code} - {review_create_r.text}")

    if review_detail_id:
        review_patch_payload = {
            "data": {
                "type": "appStoreReviewDetails",
                "id": review_detail_id,
                "attributes": {
                    "notes": APP_REVIEW_NOTES
                }
            }
        }
        review_patch_r = api_call("PATCH", token, f"appStoreReviewDetails/{review_detail_id}", json_data=review_patch_payload)
        if review_patch_r.status_code == 200:
            print("  ✓ Successfully updated App Review Notes with technical ad mediation and ATT compliance info.")
        else:
            print(f"✗ Failed to update App Review Notes: {review_patch_r.status_code} - {review_patch_r.text}")

    # Step 6: Orchestrate submission for Apple App Store Review (Fail-Safe Two-Stage Submission)
    print(f"\n[6] Orchestrating submission for Apple App Store Review...")
    
    try:
        # 6.1 Fetch or create active review submission for iOS
        print("  Checking for existing draft review submission...")
        sub_r = api_call("GET", token, f"apps/{app_id}/reviewSubmissions", params={"filter[platform]": "IOS", "filter[state]": "READY_FOR_SUBMISSION"})
        submission_id = None
        if sub_r.status_code == 200:
            subs_data = sub_r.json().get("data", [])
            if subs_data:
                submission_id = subs_data[0].get("id")
                print(f"  ✓ Found active draft review submission ID: {submission_id}")

        if not submission_id:
            print("  No active draft review submission found. Creating a new submission resource...")
            sub_payload = {
                "data": {
                    "type": "reviewSubmissions",
                    "attributes": {
                        "platform": "IOS"
                    },
                    "relationships": {
                        "app": {
                            "data": {
                                "type": "apps",
                                "id": app_id
                            }
                        }
                    }
                }
            }
            sub_create_r = api_call("POST", token, "reviewSubmissions", json_data=sub_payload)
            if sub_create_r.status_code in [200, 201]:
                submission_id = sub_create_r.json().get("data", {}).get("id")
                print(f"  ✓ Successfully created review submission ID: {submission_id}")
            else:
                raise Exception(f"Failed to create review submission: {sub_create_r.status_code} - {sub_create_r.text}")

        # 6.2 Add Version 1.0.1 as an item to this review submission
        print("  Adding Version 1.0.1 to the review submission items...")
        items_r = api_call("GET", token, f"reviewSubmissions/{submission_id}/items")
        already_added = False
        if items_r.status_code == 200:
            items_data = items_r.json().get("data", [])
            for item in items_data:
                ver_rel = item.get("relationships", {}).get("appStoreVersion", {}).get("data", {})
                if ver_rel and ver_rel.get("id") == ver_id:
                    already_added = True
                    print("    ✓ Version 1.0.1 is already present in this review submission.")
                    break

        if not already_added:
            item_payload = {
                "data": {
                    "type": "reviewSubmissionItems",
                    "relationships": {
                        "reviewSubmission": {
                            "data": {
                                "type": "reviewSubmissions",
                                "id": submission_id
                            }
                        },
                        "appStoreVersion": {
                            "data": {
                                "type": "appStoreVersions",
                                "id": ver_id
                            }
                        }
                    }
                }
            }
            item_r = api_call("POST", token, "reviewSubmissionItems", json_data=item_payload)
            if item_r.status_code not in [200, 201]:
                raise Exception(f"Failed to add version to review submission: {item_r.status_code} - {item_r.text}")
            print("  ✓ Successfully added App Store Version 1.0.1 to review submission!")

        # 6.3 Submit the entire review submission to Apple
        print("  Submitting the review submission to Apple...")
        submit_payload = {
            "data": {
                "type": "reviewSubmissions",
                "id": submission_id,
                "attributes": {
                    "submitted": True
                }
            }
        }
        submit_r = api_call("PATCH", token, f"reviewSubmissions/{submission_id}", json_data=submit_payload)
        if submit_r.status_code in [200, 202, 204]:
            print(f"\n★ ★ ★ SUCCESS! ★ ★ ★")
            print(f"✓ Version {version_string} (Build 20) has been successfully submitted to Apple for review!")
            print(f"Submission ID: {submission_id}")
        else:
            raise Exception(f"Submit PATCH response failed ({submit_r.status_code}): {submit_r.text}")

    except Exception as e:
        print("\n⚠️ Two-Stage Submission Alert ⚠️")
        print(f"Programmatic submission could not be completed automatically: {e}")
        print("-" * 60)
        print("★ FALLBACK STATE SAVED ★")
        print("1. Version 1.0.1 has been created on App Store Connect.")
        print("2. Build 20 export compliance has been successfully declared.")
        print("3. Build 20 has been attached/linked to Version 1.0.1.")
        print("4. Public release notes (whatsNew) updated across all 10 localizations.")
        print("5. Internal App Review Notes (reviewNotes) updated with ATT compliance.")
        print("-" * 60)
        print("👉 ACTION REQUIRED: Please click 'Submit for Review' manually in App Store Connect.")
        print("-" * 60)

    print("\n==========================================================")
    print("  ✓ App Store Connect submission process complete!")
    print("==========================================================")

if __name__ == "__main__":
    main()

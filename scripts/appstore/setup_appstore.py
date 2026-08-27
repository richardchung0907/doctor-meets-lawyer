#!/usr/bin/env python3
"""
App Store Connect one-shot setup for Doctor Meets Lawyer
========================================================
Modes:
  audit  - read-only: verify API key permissions, list existing resources
  create - idempotent creation: bundleId -> provisioning profile -> App record
           -> App Store version 1.0.0 -> 3 localizations (en-US/zh-Hans/zh-Hant)
           -> categories -> age rating -> review details -> HK-only availability

Usage:
  python scripts/appstore/setup_appstore.py audit
  python scripts/appstore/setup_appstore.py create

Requires: keys.txt (ASC keys), ios-signing/AuthKey_LSLS88W574.p8
Deps:     pip install requests pyjwt
"""

import base64
import io
import json
import os
import sys
import time

import jwt
import requests

# ---------------------------------------------------------------------------
# Bootstrap & console
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))
os.chdir(PROJECT_DIR)

if sys.platform.startswith("win"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

KEYS_FILE = "keys.txt"
SIGNING_DIR = "ios-signing"
P8_FILE = os.path.join(SIGNING_DIR, "AuthKey_LSLS88W574.p8")
PROFILE_OUT = os.path.join(SIGNING_DIR, "doctor_meets_lawyer_app_store.mobileprovision")
BASE = "https://api.appstoreconnect.apple.com/v1"
RATE = 1.5  # seconds between API calls (ASC rate limit safety)

# Account-level facts (from Filter_APP2 / Apple developer account)
TEAM_ID = "3W8574PF9N"
CERT_ID = "9NYCT2Q8LA"          # Apple Distribution: Ka Chai CHUNG (expires 2027-07-17)
BUNDLE_ID = "com.richardchung.doctormeetslawyer"
PROFILE_NAME = "Doctor Meets Lawyer App Store Profile"
APP_NAME = "Doctor Meets Lawyer"
SKU = "doctor-meets-lawyer"
VERSION = "1.0.0"

# ---------------------------------------------------------------------------
# Copy (3 locales; HK storefront needs en-US / zh-Hans / zh-Hant)
# ---------------------------------------------------------------------------
METADATA = {
    "en-US": {
        "subtitle": "Where doctors & lawyers talk",
        "description": (
            "Doctor Meets Lawyer is a cross-industry conversation platform where doctors, "
            "lawyers and professionals from every field meet, talk and understand each other.\n\n"
            "\u2022 Daily topic hall \u2014 fresh discussion topics rotate every 24 hours\n"
            "\u2022 Direct messages \u2014 continue any conversation one-on-one in private chats\n"
            "\u2022 Profession filters \u2014 see posts and opinions from doctors, lawyers and more\n"
            "\u2022 Member profiles \u2014 tap any username to see who you are talking to\n"
            "\u2022 Trilingual \u2014 English, Simplified Chinese and Traditional Chinese\n\n"
            "Have a legal question? Ask a lawyer. Have a medical one? Ask a doctor. "
            "This is where different professions meet."
        ),
        "keywords": "professional,network,talk,topic,discuss,medical,legal,cross-industry,meet,chat",
        "whatsNew": "Initial release. Join topic discussions and connect with professionals across industries.",
        "promotionalText": "Now available: cross-industry conversations between doctors, lawyers and professionals. Join a topic and start talking today!",
        "name": APP_NAME,
    },
    "zh-Hans": {
        "subtitle": "医生与律师的专业交流平台",
        "description": (
            "Doctor Meets Lawyer 是一个跨行业交流平台，让医生、律师和各行各业的专业人士在这里相遇、交谈、互相理解。\n\n"
            "\u2022 每日话题大厅 —— 话题每 24 小时轮换，永远有新讨论\n"
            "\u2022 私讯对话 —— 在私密聊天中与任何人一对一深入交流\n"
            "\u2022 职业筛选 —— 只看医生、律师或其他职业的观点\n"
            "\u2022 个人主页 —— 点击任何用户名，了解正在与你对话的人\n"
            "\u2022 三语支持 —— 英文、简体中文、繁体中文\n\n"
            "有法律问题？问律师。有医疗疑问？问医生。在这里，不同职业彼此理解。"
        ),
        "keywords": "专业人士,交流,聊天,话题,讨论,医疗,法律,跨行业,认识,对话",
        "whatsNew": "首次发布。加入话题讨论，与跨行业专业人士建立联系。",
        "promotionalText": "现已上线：医生、律师与专业人士的跨行业交流平台。加入话题，今天就开始对话！",
        "name": APP_NAME,
    },
    "zh-Hant": {
        "subtitle": "醫生與律師的專業交流平台",
        "description": (
            "Doctor Meets Lawyer 是一個跨行業交流平台，讓醫生、律師和各行各業的專業人士在這裡相遇、交談、互相理解。\n\n"
            "\u2022 每日話題大廳 —— 話題每 24 小時輪換，總有新討論\n"
            "\u2022 私訊對話 —— 在私密聊天中與任何人一對一深入交流\n"
            "\u2022 職業篩選 —— 只看醫生、律師或其他職業的觀點\n"
            "\u2022 個人主頁 —— 點擊任何用戶名，了解正在與你對話的人\n"
            "\u2022 三語支援 —— 英文、簡體中文、繁體中文\n\n"
            "有法律問題？問律師。有醫療疑問？問醫生。在這裡，不同職業彼此理解。"
        ),
        "keywords": "專業人士,交流,聊天,話題,討論,醫療,法律,跨行業,認識,對話",
        "whatsNew": "首次發佈。加入話題討論，與跨行業專業人士建立聯繫。",
        "promotionalText": "現已上線：醫生、律師與專業人士的跨行業交流平台。加入話題，今天就開始對話！",
        "name": APP_NAME,
    },
}

REVIEW_NOTES = (
    "Doctor Meets Lawyer is a cross-industry discussion and messaging app. "
    "Users sign up with any email address; no demo account is required. "
    "The app contains user-generated content (topic posts and private messages) "
    "with a basic profanity filter and blocklist. "
    "No ads, no in-app purchases, no paid content, no encryption beyond standard HTTPS."
)

COPYRIGHT = "\u00a9 2026 Ka Chai CHUNG. All rights reserved."

# Age rating: honest defaults for a UGC chat app (no restricted content)
AGE_RATING = {
    "alcoholTobaccoOrDrugUseOrReferences": False,
    "contests": False,
    "gambling": False,
    "gamblingSimulated": False,
    "horrorOrFearThemes": False,
    "matureOrSuggestiveThemes": False,
    "medicalOrTreatmentInformation": False,
    "profanityOrCrudeHumor": False,
    "sexualContentGraphicAndNudity": False,
    "sexualContentOrNudity": False,
    "unrestrictedWebAccess": False,
    "violenceCartoonOrFantasy": False,
    "violenceRealistic": False,
    "violenceRealisticProlongedGraphicOrSadistic": False,
    "seventeenPlus": False,
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def load_keys():
    keys = {}
    with open(KEYS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and ":" in line:
                k, v = line.split(":", 1)
                keys[k.strip()] = v.strip()
    return keys


def make_token():
    keys = load_keys()
    issuer = keys.get("Issuer ID for App Store Connect API")
    key_id = keys.get("Key ID for App Store Connect API")
    with open(P8_FILE, "r", encoding="utf-8") as f:
        private_key = f.read()
    headers = {"alg": "ES256", "kid": key_id, "typ": "JWT"}
    payload = {"iss": issuer, "exp": int(time.time()) + 1200, "aud": "appstoreconnect-v1"}
    return jwt.encode(payload, private_key, algorithm="ES256", headers=headers)


TOKEN = None
def api(method, path, params=None, json_data=None, expect=(200, 201, 202, 204, 409), base=None):
    """ASC API call with rate limiting and verbose errors. base overrides URL prefix (default v1)."""
    global TOKEN
    if TOKEN is None:
        TOKEN = make_token()
    url = f"{base or BASE}/{path}"
    headers = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
    for attempt in range(3):
        r = requests.request(method, url, headers=headers, params=params, json=json_data, timeout=60)
        if r.status_code == 429 or r.status_code >= 500:
            wait = 10 * (attempt + 1)
            print(f"    [HTTP {r.status_code}] retry in {wait}s ...")
            time.sleep(wait)
            continue
        break
    time.sleep(RATE)
    if r.status_code not in expect:
        body = r.text[:600]
        raise RuntimeError(f"{method} {path} -> HTTP {r.status_code}: {body}")
    return r


def get_one(path, params=None):
    r = api("GET", path, params=params)
    data = r.json().get("data", [])
    return data[0] if isinstance(data, list) and data else (data if isinstance(data, dict) else None)


# ---------------------------------------------------------------------------
# AUDIT
# ---------------------------------------------------------------------------
def audit():
    print("=" * 64)
    print("  App Store Connect — READ-ONLY AUDIT")
    print("=" * 64)

    print("\n[1] API key auth check (list distribution certificates)")
    r = api("GET", "certificates", params={"filter[certificateType]": "DISTRIBUTION"})
    for c in r.json().get("data", []):
        a = c.get("attributes", {})
        print(f"    cert id={c['id']} name={a.get('name')} serial={a.get('serialNumber')} "
              f"type={a.get('certificateType')} expires={a.get('expirationDate')}")
    match = [c for c in r.json().get("data", []) if c["id"] == CERT_ID]
    print(f"    -> reusable distribution cert {CERT_ID} present: {bool(match)}")

    print("\n[2] Existing bundle IDs")
    r = api("GET", "bundleIds", params={"filter[identifier]": BUNDLE_ID})
    for b in r.json().get("data", []):
        print(f"    bundleId id={b['id']} identifier={b['attributes']['identifier']} "
              f"platform={b['attributes'].get('platform')} seedId={b['attributes'].get('seedId')}")

    print("\n[3] Existing provisioning profiles")
    r = api("GET", "profiles", params={"filter[profileType]": "IOS_APP_STORE"})
    for p in r.json().get("data", []):
        print(f"    profile id={p['id']} name={p['attributes']['name']} "
              f"state={p['attributes'].get('profileState')} expires={p['attributes'].get('expirationDate')}")

    print("\n[4] Existing apps with our bundle id")
    r = api("GET", "apps", params={"filter[bundleId]": BUNDLE_ID})
    apps = r.json().get("data", [])
    for a in apps:
        print(f"    app id={a['id']} name={a['attributes']['name']} "
              f"primaryLocale={a['attributes'].get('primaryLocale')} sku={a['attributes'].get('sku')}")
    if not apps:
        print("    (none)")

    print("\n[5] Categories (platform IOS)")
    r = api("GET", "appCategories", params={"filter[platforms]": "IOS", "limit": 200})
    want = {"SOCIAL_NETWORKING", "BUSINESS", "LIFESTYLE", "MEDICAL", "EDUCATION"}
    for c in r.json().get("data", []):
        if c["id"] in want:
            print(f"    category id={c['id']}")

    print("\n[6] Territory HK (paged scan)")
    import re
    params = {"limit": 200}
    hk = None
    total = 0
    while True:
        r = api("GET", "territories", params=params)
        data = r.json().get("data", [])
        total += len(data)
        for t in data:
            if t.get("id") == "HKG":  # territory id IS the ISO-3166 alpha-3 code (e.g. AFG, HKG)
                hk = t
        links = r.json().get("links", {})
        m = re.search(r"offset\[(\d+)\]", links.get("next") or "")
        if m and data:
            params["offset"] = int(m.group(1))
        else:
            break
    print(f"    scanned {total} territories")
    if hk:
        print(f"    HK territory id={hk['id']} currency={hk['attributes'].get('currency')}")
    else:
        print("    (HKG not found!)")

    print("\n[7] Reference: Filter_APP2 review contact info (same account holder)")
    try:
        rd = get_one("appStoreVersions/841b3d9a-4111-4804-89cb-3fba95034b0b/appStoreReviewDetail")
        if rd:
            a = rd.get("attributes", {})
            print(f"    contact={a.get('contactFirstName')} {a.get('contactLastName')} "
                  f"email={a.get('contactEmail')} phone={a.get('contactPhone')}")
        else:
            print("    (no review detail found for reference app)")
    except RuntimeError as e:
        print(f"    (skip) {e}")

    print("\nAUDIT DONE")


# ---------------------------------------------------------------------------
# CREATE (idempotent)
# ---------------------------------------------------------------------------
def create_bundle_id():
    print("\n[CREATE] bundleId")
    r = api("GET", "bundleIds", params={"filter[identifier]": BUNDLE_ID})
    existing = r.json().get("data", [])
    if existing:
        bid = existing[0]
        print(f"    exists: id={bid['id']}")
        return bid["id"]
    payload = {
        "data": {
            "type": "bundleIds",
            "attributes": {"name": APP_NAME, "identifier": BUNDLE_ID, "platform": "IOS", "seedId": TEAM_ID},
        }
    }
    r = api("POST", "bundleIds", json_data=payload)
    bid = r.json()["data"]["id"]
    print(f"    created: id={bid}")
    return bid


def create_profile(bundle_id):
    print("\n[CREATE] provisioning profile")
    r = api("GET", "profiles", params={"filter[name]": PROFILE_NAME})
    existing = r.json().get("data", [])
    if existing:
        pid = existing[0]["id"]
        print(f"    exists: id={pid} state={existing[0]['attributes'].get('profileState')}")
        return pid
    payload = {
        "data": {
            "type": "profiles",
            "attributes": {"name": PROFILE_NAME, "profileType": "IOS_APP_STORE"},
            "relationships": {
                "bundleId": {"data": {"type": "bundleIds", "id": bundle_id}},
                "certificates": {"data": [{"type": "certificates", "id": CERT_ID}]},
            },
        }
    }
    r = api("POST", "profiles", json_data=payload)
    prof = r.json()["data"]
    pid = prof["id"]
    content = prof["attributes"].get("profileContent")
    if content:
        raw = base64.b64decode(content)
        with open(PROFILE_OUT, "wb") as f:
            f.write(raw)
        print(f"    created: id={pid}  profile saved to {PROFILE_OUT} ({len(raw)} bytes)")
    else:
        print(f"    created: id={pid}  (no profileContent in response)")
    return pid


def create_app():
    print("\n[CREATE] app record")
    r = api("GET", "apps", params={"filter[bundleId]": BUNDLE_ID})
    existing = r.json().get("data", [])
    if existing:
        aid = existing[0]["id"]
        print(f"    exists: id={aid} name={existing[0]['attributes']['name']}")
        return aid
    payload = {
        "data": {
            "type": "apps",
            "attributes": {"name": APP_NAME, "primaryLocale": "en-US", "sku": SKU, "bundleId": BUNDLE_ID},
        }
    }
    r = api("POST", "apps", json_data=payload)
    aid = r.json()["data"]["id"]
    print(f"    created: id={aid}")
    return aid


def ensure_version(app_id):
    print("\n[CREATE] appStoreVersion 1.0.0")
    r = api("GET", f"apps/{app_id}/appStoreVersions", params={"filter[platform]": "IOS"})
    existing = r.json().get("data", [])
    for v in existing:
        if v["attributes"].get("versionString") == VERSION:
            print(f"    exists: id={v['id']}")
            return v["id"]
    if existing:
        # web-created default version (e.g. "1.0") -> rename to VERSION and reuse
        v = existing[0]
        vid = v["id"]
        api("PATCH", f"appStoreVersions/{vid}",
            json_data={"data": {"type": "appStoreVersions", "id": vid,
                                "attributes": {"versionString": VERSION}}})
        print(f"    adopted web default version, renamed to {VERSION}: id={vid}")
        return vid
    payload = {
        "data": {
            "type": "appStoreVersions",
            "attributes": {"platform": "IOS", "versionString": VERSION, "copyright": COPYRIGHT},
            "relationships": {"app": {"data": {"type": "apps", "id": app_id}}},
        }
    }
    r = api("POST", "appStoreVersions", json_data=payload)
    vid = r.json()["data"]["id"]
    print(f"    created: id={vid}")
    return vid


def ensure_version_localizations(version_id):
    print("\n[CREATE] appStoreVersionLocalizations (3 locales)")
    r = api("GET", f"appStoreVersions/{version_id}/appStoreVersionLocalizations")
    existing = {l["attributes"]["locale"]: l for l in r.json().get("data", [])}
    for locale, m in METADATA.items():
        attrs = {
            "description": m["description"],
            "keywords": m["keywords"],
            "promotionalText": m["promotionalText"],
        }
        whats = {"whatsNew": m["whatsNew"]}
        if locale in existing:
            lid = existing[locale]["id"]
            api("PATCH", f"appStoreVersionLocalizations/{lid}",
                json_data={"data": {"type": "appStoreVersionLocalizations", "id": lid, "attributes": attrs}})
            try:
                # whatsNew may be locked (409) once the version exists in some states; don't swallow silently
                api("PATCH", f"appStoreVersionLocalizations/{lid}",
                    json_data={"data": {"type": "appStoreVersionLocalizations", "id": lid, "attributes": whats}})
            except RuntimeError as e:
                print(f"    (whatsNew locked for {locale}, skipped: {str(e)[:80]})")
            print(f"    updated: {locale}")
        else:
            payload = {
                "data": {
                    "type": "appStoreVersionLocalizations",
                    "attributes": {"locale": locale, **attrs, **whats},
                    "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": version_id}}},
                }
            }
            api("POST", "appStoreVersionLocalizations", json_data=payload)
            print(f"    created: {locale}")


def ensure_app_info(app_id):
    print("\n[CREATE] appInfos: categories + localizations")
    r = api("GET", f"apps/{app_id}/appInfos")
    info = r.json()["data"][0]
    info_id = info["id"]
    print(f"    appInfo id={info_id}")

    # categories (2026 API: category name == resource id, e.g. SOCIAL_NETWORKING)
    r = api("GET", "appCategories", params={"filter[platforms]": "IOS", "limit": 200})
    cat_ids = {c["id"] for c in r.json().get("data", [])}
    primary = "SOCIAL_NETWORKING" if "SOCIAL_NETWORKING" in cat_ids else None
    secondary = "BUSINESS" if "BUSINESS" in cat_ids else None
    if not primary or not secondary:
        raise RuntimeError(f"categories missing: SOCIAL_NETWORKING={primary} BUSINESS={secondary}")
    rel = {}
    rel["primaryCategory"] = {"data": {"type": "appCategories", "id": primary}}
    rel["secondaryCategory"] = {"data": {"type": "appCategories", "id": secondary}}
    api("PATCH", f"appInfos/{info_id}",
        json_data={"data": {"type": "appInfos", "id": info_id, "relationships": rel}})
    print(f"    categories: Social Networking ({primary}) / Business ({secondary})")

    # appInfoLocalizations
    r = api("GET", f"appInfos/{info_id}/appInfoLocalizations")
    existing = {l["attributes"]["locale"]: l for l in r.json().get("data", [])}
    for locale, m in METADATA.items():
        attrs = {"name": m["name"], "subtitle": m["subtitle"]}
        # privacyPolicyUrl intentionally left unset until a real URL is provided
        if locale in existing:
            lid = existing[locale]["id"]
            api("PATCH", f"appInfoLocalizations/{lid}",
                json_data={"data": {"type": "appInfoLocalizations", "id": lid, "attributes": attrs}})
            print(f"    appInfoLoc updated: {locale}")
        else:
            payload = {
                "data": {
                    "type": "appInfoLocalizations",
                    "attributes": {"locale": locale, **attrs},
                    "relationships": {"appInfo": {"data": {"type": "appInfos", "id": info_id}}},
                }
            }
            api("POST", "appInfoLocalizations", json_data=payload)
            print(f"    appInfoLoc created: {locale}")
    return info_id


def ensure_age_rating(info_id):
    print("\n[CREATE] ageRatingDeclaration")
    try:
        existing = get_one(f"appInfos/{info_id}/ageRatingDeclaration")
    except RuntimeError:
        existing = None
    if existing:
        rid = existing["id"]
        api("PATCH", f"ageRatingDeclarations/{rid}",
            json_data={"data": {"type": "ageRatingDeclarations", "id": rid, "attributes": AGE_RATING}})
        print(f"    updated: id={rid}")
    else:
        payload = {
            "data": {
                "type": "ageRatingDeclarations",
                "attributes": AGE_RATING,
                "relationships": {"appInfo": {"data": {"type": "appInfos", "id": info_id}}},
            }
        }
        r = api("POST", f"appInfos/{info_id}/ageRatingDeclaration", json_data=payload)
        print(f"    created: id={r.json()['data']['id']}")


def ensure_review_detail(app_id, version_id, contact):
    print("\n[CREATE] appStoreReviewDetail")
    try:
        existing = get_one(f"appStoreVersions/{version_id}/appStoreReviewDetail")
    except RuntimeError:
        existing = None
    attrs = {
        "contactFirstName": contact.get("first", "Ka Chai"),
        "contactLastName": contact.get("last", "CHUNG"),
        "contactEmail": contact.get("email", "richardchung_0907@hotmail.com"),
        "contactPhone": contact.get("phone", ""),
        "demoAccountRequired": False,
        "notes": REVIEW_NOTES,
    }
    if existing:
        rid = existing["id"]
        api("PATCH", f"appStoreReviewDetails/{rid}",
            json_data={"data": {"type": "appStoreReviewDetails", "id": rid, "attributes": attrs}})
        print(f"    updated: id={rid}")
    else:
        payload = {
            "data": {
                "type": "appStoreReviewDetails",
                "attributes": attrs,
                "relationships": {"appStoreVersion": {"data": {"type": "appStoreVersions", "id": version_id}}},
            }
        }
        r = api("POST", "appStoreReviewDetails", json_data=payload)
        print(f"    created: id={r.json()['data']['id']}")


def ensure_hk_availability(app_id):
    """Restrict app availability to Hong Kong only (2026 API: appAvailabilityV2)."""
    print("\n[CREATE] availability: Hong Kong only")
    r = api("GET", f"apps/{app_id}/appAvailabilityV2")
    av = r.json()["data"]
    av_id = av["id"]
    print(f"    appAvailability id={av_id} availableInNewTerritories={av['attributes'].get('availableInNewTerritories')}")

    # try to stop new territories from being auto-added (2026 API: only settable at creation time)
    try:
        api("PATCH", f"appAvailabilities/{av_id}",
            json_data={"data": {"type": "appAvailabilities", "id": av_id,
                                "attributes": {"availableInNewTerritories": False}}})
        print("    availableInNewTerritories -> False")
    except RuntimeError as e:
        print(f"    [INFO] cannot PATCH availableInNewTerritories via API: {str(e)[:120]}")
        print("    [INFO] -> will disable every non-HK territory instead; "
              "verify 'availableInNewTerritories' stays False in App Store Connect web UI")

    # list current territory availabilities; TA id encodes territory: base64url({"s":appId,"t":code})
    def ta_code(ta_id):
        try:
            padded = ta_id + "=" * (-len(ta_id) % 4)
            obj = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
            return obj.get("t", "")
        except Exception:
            return ""

    r = api("GET", f"appAvailabilities/{av_id}/territoryAvailabilities",
            params={"limit": 200}, base="https://api.appstoreconnect.apple.com/v2")
    items = r.json().get("data", [])
    print(f"    current territoryAvailabilities: {len(items)}")
    has_hk = False
    for t in items:
        code = ta_code(t["id"])
        if code == "HKG":
            has_hk = True
            print(f"    kept: {code}")
        else:
            api("PATCH", f"territoryAvailabilities/{t['id']}",
                json_data={"data": {"type": "territoryAvailabilities", "id": t["id"],
                                    "attributes": {"available": False}}})
            print(f"    removed: {code}")

    # ensure HKG exists (create if missing)
    if not has_hk:
        payload = {
            "data": {
                "type": "territoryAvailabilities",
                "relationships": {
                    "appAvailability": {"data": {"type": "appAvailabilities", "id": av_id}},
                    "territory": {"data": {"type": "territories", "id": "HKG"}},
                },
            }
        }
        r = api("POST", "territoryAvailabilities", json_data=payload)
        print(f"    created HKG availability: id={r.json()['data']['id']}")
    print("    -> availability is now Hong Kong only")


def create():
    print("=" * 64)
    print("  App Store Connect — CREATE SETUP (idempotent)")
    print("=" * 64)
    bundle_id = create_bundle_id()
    create_profile(bundle_id)
    app_id = create_app()
    version_id = ensure_version(app_id)
    ensure_version_localizations(version_id)
    info_id = ensure_app_info(app_id)
    ensure_age_rating(info_id)
    contact = audit_contact()
    ensure_review_detail(app_id, version_id, contact)
    ensure_hk_availability(app_id)
    print("\n" + "=" * 64)
    print(f"  DONE. app_id={app_id}")
    print("  Remaining manual/web-only steps: privacy policy URL, App Privacy labels,")
    print("  screenshots, then upload a build and submit.")
    print("=" * 64)


def audit_contact():
    """Try to reuse the same account holder's review contact from Filter_APP2."""
    try:
        rd = get_one("appStoreVersions/841b3d9a-4111-4804-89cb-3fba95034b0b/appStoreReviewDetail")
        if rd:
            a = rd.get("attributes", {})
            c = {
                "first": a.get("contactFirstName") or "Ka Chai",
                "last": a.get("contactLastName") or "CHUNG",
                "email": a.get("contactEmail") or "richardchung_0907@hotmail.com",
                "phone": a.get("contactPhone") or "",
            }
            print(f"\n[INFO] reusing review contact from reference app: {c['first']} {c['last']} "
                  f"phone={'set' if c['phone'] else 'MISSING'}")
            return c
    except RuntimeError as e:
        print(f"\n[INFO] could not fetch reference review detail: {e}")
    return {"first": "Richard", "last": "Chung",
            "email": "richardchung_0907@hotmail.com", "phone": "+852 66744148"}


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "audit"
    if mode == "audit":
        audit()
    elif mode == "create":
        create()
    else:
        print("usage: python scripts/appstore/setup_appstore.py [audit|create]")
        sys.exit(1)

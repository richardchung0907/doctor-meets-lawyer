#!/usr/bin/env python3
"""
rc_setup.py — RevenueCat 后台自动配置脚本（doctor-meets-lawyer 项目）

基于 docs/revenuecat/ 的 API v2 文档，在项目 proje2683dd6 中配置：
  Entitlement / Products (Test Store) / Offering / Packages / Webhook

用法:
  python scripts/rc_setup.py            # 执行全部配置步骤（每步独立，失败不中断）
  python scripts/rc_setup.py --dry-run  # 只打印将执行的请求，不发真实请求

密钥从 keys.txt 解析（不硬编码、不输出明文）。
"""

import argparse
import json
import re
import sys
import uuid
from datetime import datetime

import requests

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "https://api.revenuecat.com/v2"
PROJECT_ID = "proje2683dd6"


def load_secret_key() -> str:
    with open("keys.txt", encoding="utf-8") as f:
        content = f.read()
    m = re.search(r"Secret API keys for revenuecat:\s*(\S+)", content)
    if not m:
        raise SystemExit("ERROR: keys.txt 中找不到 Secret API key")
    return m.group(1).strip()


SECRET = load_secret_key()


def load_webhook_auth_header() -> str:
    """从 keys.txt 读取 webhook 完整 Authorization header（如 `Bearer rc-webhook-...`）。

    注意：webhook 的 authorization_header 与 Supabase 的 RC_WEBHOOK_AUTH_TOKEN secret
    必须保持一致（rc-webhook 函数用 `Authorization === Bearer ${token}` 校验）。此前脚本
    硬编码 `Bearer rc-webhook-{PROJECT_ID}`，与 keys.txt 不一致会导致回调 401（2026-08-21
    已修复为从 keys.txt 读取权威值）。
    """
    with open("keys.txt", encoding="utf-8") as f:
        content = f.read()
    m = re.search(r"RC_WEBHOOK_AUTH_TOKEN[^\n]*:\s*(Bearer\s+\S+)", content)
    if not m:
        raise SystemExit("ERROR: keys.txt 中找不到 RC_WEBHOOK_AUTH_TOKEN")
    return m.group(1).strip()


HEADERS = {"Authorization": f"Bearer {SECRET}", "Content-Type": "application/json"}


def api(method: str, path: str, body=None, dry_run: bool = False):
    url = f"{BASE}{path}"
    if dry_run:
        print(f"  [DRY-RUN] {method} {url}")
        if body:
            print(f"    body: {json.dumps(body, ensure_ascii=False)}")
        return None
    resp = requests.request(method, url, headers=HEADERS, json=body, timeout=60)
    try:
        data = resp.json()
    except Exception:
        data = resp.text
    print(f"  {method} {url} -> {resp.status_code}")
    if resp.status_code >= 300:
        msg = data.get("message", data) if isinstance(data, dict) else data
        print(f"    ERROR: {msg}")
        return None
    return data


def redact(obj, keys=("key", "signing_secret", "authorization_header", "shared_secret")):
    """脱敏打印敏感字段"""
    if isinstance(obj, dict):
        return {k: ("[redacted]" if k in keys and v else v) for k, v in obj.items()}
    return obj


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    dry = args.dry_run

    print("=" * 60)
    print(" RevenueCat 后台配置")
    print(f" 项目: {PROJECT_ID}")
    print(f" 时间: {datetime.now().isoformat()}")
    print(f" 模式: {'DRY-RUN（不发送真实请求）' if dry else '真实执行'}")
    print("=" * 60)

    # ---------- Step 1: Entitlement ----------
    print("\n[Step 1] 创建 Entitlement: premium")
    ent_id = None
    ent = api("POST", f"/projects/{PROJECT_ID}/entitlements",
              {"lookup_key": "premium", "display_name": "Premium"}, dry)
    if ent:
        ent_id = ent.get("id")
        print(f"    OK: entitlement_id={ent_id}")
    else:
        # 可能已存在，尝试列出确认
        ents = api("GET", f"/projects/{PROJECT_ID}/entitlements", dry_run=dry)
        if ents:
            ent_id = next((e["id"] for e in ents.get("items", [])
                           if e.get("lookup_key") == "premium"), None)
            if ent_id:
                print(f"    已存在: entitlement_id={ent_id}")
    print(f"  -> ENTL_ID={ent_id}")

    # ---------- Step 2: Products (Test Store) ----------
    print("\n[Step 2] 创建 Products (Test Store app8233ce453d)")
    # 产品决策（2026-08-21）：高级会员 = 纯身份标识，统一仅年费 → 只保留 premium_yearly
    products = [
        {"store_identifier": "premium_yearly", "type": "subscription",
         "display_name": "Premium Yearly", "title": "Premium Yearly",
         "subscription": {"duration": "P1Y"}},
    ]
    created_products = {}
    for p in products:
        print(f"  - 创建 product: {p['store_identifier']}")
        body = {"store_identifier": p["store_identifier"],
                "app_id": "app8233ce453d",
                "type": p["type"],
                "display_name": p["display_name"],
                "title": p["title"]}
        if "subscription" in p:
            body["subscription"] = p["subscription"]
        prod = api("POST", f"/projects/{PROJECT_ID}/products", body, dry)
        if prod:
            pid = prod.get("id")
            print(f"    OK: product_id={pid}")
            created_products[p["store_identifier"]] = pid
        else:
            # 已存在则查找
            prods = api("GET", f"/projects/{PROJECT_ID}/products", dry_run=dry)
            if prods:
                pid = next((x["id"] for x in prods.get("items", [])
                            if x.get("store_identifier") == p["store_identifier"]), None)
                if pid:
                    print(f"    已存在: product_id={pid}")
                    created_products[p["store_identifier"]] = pid
    print(f"  -> PRODUCT_IDS={created_products}")

    # ---------- Step 3: Attach products to entitlement ----------
    if ent_id and created_products:
        print("\n[Step 3] Attach products 到 Entitlement")
        attach = api("POST", f"/projects/{PROJECT_ID}/entitlements/{ent_id}/actions/attach_products",
                     {"product_ids": list(created_products.values())}, dry)
        if attach:
            print("    OK: products attached")
    else:
        print("\n[Step 3] 跳过（缺少 entitlement 或 products）")

    # ---------- Step 4: Offering ----------
    print("\n[Step 4] 创建 Offering: premium")
    off = api("POST", f"/projects/{PROJECT_ID}/offerings",
              {"lookup_key": "premium", "display_name": "Premium"}, dry)
    off_id = off.get("id") if off else None
    if not off_id:
        offs = api("GET", f"/projects/{PROJECT_ID}/offerings", dry_run=dry)
        if offs:
            off_id = next((o["id"] for o in offs.get("items", [])
                           if o.get("lookup_key") == "premium"), None)
            if off_id:
                print(f"    已存在: offering_id={off_id}")
    print(f"  -> OFFERING_ID={off_id}")

    # ---------- Step 5: Packages + attach products ----------
    if off_id:
        print("\n[Step 5] 创建 Packages 并 attach products")
        package_defs = [
            {"lookup_key": "premium_yearly", "display_name": "Premium Yearly", "position": 1,
             "product_key": "premium_yearly"},
        ]
        for pd in package_defs:
            print(f"  - 创建 package: {pd['lookup_key']}")
            pkg = api("POST", f"/projects/{PROJECT_ID}/offerings/{off_id}/packages",
                      {"lookup_key": pd["lookup_key"], "display_name": pd["display_name"],
                       "position": pd["position"]}, dry)
            pkg_id = pkg.get("id") if pkg else None
            if not pkg_id:
                pkgs = api("GET", f"/projects/{PROJECT_ID}/offerings/{off_id}/packages", dry_run=dry)
                if pkgs:
                    pkg_id = next((x["id"] for x in pkgs.get("items", [])
                                   if x.get("lookup_key") == pd["lookup_key"]), None)
            prod_id = created_products.get(pd["product_key"])
            if pkg_id and prod_id:
                print(f"    OK: package_id={pkg_id}，attach product {prod_id}")
                api("POST", f"/projects/{PROJECT_ID}/packages/{pkg_id}/actions/attach_products",
                    {"products": [{"product_id": prod_id, "eligibility_criteria": "all"}]}, dry)
    else:
        print("\n[Step 5] 跳过（缺少 offering）")

    # ---------- Step 6: Webhook ----------
    print("\n[Step 6] 配置 Webhook integration（Supabase rc-webhook）")
    supabase_url = "https://xxtmeuabohgvcqzyphtx.supabase.co"
    wh_url = f"{supabase_url}/functions/v1/rc-webhook"
    event_types = ["initial_purchase", "renewal", "product_change", "cancellation",
                   "expiration", "uncancellation", "billing_issue", "transfer"]
    wh = api("POST", f"/projects/{PROJECT_ID}/integrations/webhooks",
             {"name": "rc-webhook", "url": wh_url,
              "authorization_header": load_webhook_auth_header(),
              "environment": "production", "event_types": event_types}, dry)
    if wh:
        print(f"    OK: webhook_id={wh.get('id')}")
        print(f"    signing_secret={redact(wh).get('signing_secret')}")
    else:
        # 已存在则列出确认
        whs = api("GET", f"/projects/{PROJECT_ID}/integrations/webhooks", dry_run=dry)
        if whs:
            existing = [w for w in whs.get("items", []) if w.get("name") == "rc-webhook"]
            if existing:
                wh = existing[0]
                print(f"    已存在: webhook_id={wh.get('id')}")
                print(f"    url={wh.get('url')}, environment={wh.get('environment')}")
            else:
                print("    WARN: webhook 创建失败且未找到同名项")
        else:
            print("    WARN: webhook 创建失败（Supabase 函数可能未部署）")

    # ---------- 汇总 ----------
    print("\n" + "=" * 60)
    print(" 配置完成。结果摘要")
    print("=" * 60)
    print(f"  entitlement:  {ent_id}")
    print(f"  products:     {created_products}")
    print(f"  offering:     {off_id}")
    print(f"  webhook:      {wh.get('id') if wh else 'N/A'}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
turnMD_rc.py — turnMD.py 的 RevenueCat 文档优化版

针对 RevenueCat 文档站 (Docusaurus + Stoplight Elements) 的网页 → Markdown 下载器。

优化点 vs turnMD.py:
  1. RevenueCat docs 是 Server-Side Rendered 页面 —— 直接用 requests 取 HTML，无需 Playwright 浏览器
  2. 静态指南页支持 `.md` 后缀（官网 llms.txt 推荐方式）—— 直接下载纯净 Markdown
  3. llms.txt 提供精确页面清单 —— 无需盲目爬全站
  4. api-v2 是 OpenAPI 单页大文档（344KB 文本）—— 按 tag/资源拆分，便于 agent 按需加载

用法:
  python scripts/turnMD_rc.py                     # 下载默认清单（api-v2 拆分 + 核心指南页）
  python scripts/turnMD_rc.py --all               # 下载 llms.txt 中所有页面
  python scripts/turnMD_rc.py --list-pages         # 仅列出要下载的页面，不下载
  python scripts/turnMD_rc.py --output-dir docs/my_docs   # 自定义输出目录

依赖:
  pip install requests beautifulsoup4 markdownify
"""

import argparse
import os
import re
import sys
from collections import OrderedDict
from datetime import datetime
from urllib.parse import urljoin, urlparse

# Windows 控制台默认 cp1252，强制 UTF-8 输出（否则中文报错）
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import requests
from bs4 import BeautifulSoup
from markdownify import markdownify as md

# =========================================================
# 配置
# =========================================================
DOCS_BASE = "https://www.revenuecat.com"
LLMS_TXT_URL = f"{DOCS_BASE}/docs/llms.txt"
API_V2_URL = f"{DOCS_BASE}/docs/api-v2"
OUTPUT_DIR = "docs/revenuecat"

REQUEST_TIMEOUT = 120

# =========================================================
# API v2 TAG 分组映射
# =========================================================
# 第一段为 tag 名，映射到输出文件名和标题
# General 部分（非 Endpoint Reference）合并到 00_overview
TAG_GROUP_MAP = OrderedDict([
    # (tag 前缀, 文件名, 显示标题)
    ("Overview-(v2)",              ("00_overview",            "General — Overview")),
    ("Pagination",                 ("00_overview",            "General — Pagination")),
    ("Rate-Limit",                 ("00_overview",            "General — Rate Limit")),
    ("Expandables",                ("00_overview",            "General — Expandables")),
    ("Error-Handling",             ("00_overview",            "General — Error Handling")),
    ("Representation-of-Subscriptions", ("00_overview",       "General — Subscription Representation")),
    ("Subscription-Data-Model",    ("00_overview",            "Model — Subscription Data Model")),
    ("Audience",                   ("01_audience",            "Audience")),
    ("App",                        ("02_app",                 "App")),
    ("Audit-Log",                  ("03_audit_log",           "Audit Log")),
    ("Charts-and-Metrics",         ("04_charts_metrics",      "Charts & Metrics")),
    ("Collaborator",               ("05_collaborator",        "Collaborator")),
    ("Customer",                   ("06_customer",            "Customer")),
    ("Entitlement",                ("07_entitlement",         "Entitlement")),
    ("Offering",                   ("08_offering",            "Offering")),
    ("Package",                    ("09_package",             "Package")),
    ("Product",                    ("10_product",             "Product")),
    ("Virtual-Currency",           ("11_virtual_currency",    "Virtual Currency")),
    ("Purchase",                   ("12_purchase",            "Purchase")),
    ("Subscription",               ("13_subscription",        "Subscription")),
    ("Invoice",                    ("14_invoice",             "Invoice")),
    ("Paywall",                    ("15_paywall",             "Paywall")),
    ("Integration",                ("16_integration",         "Integration")),
    ("Project",                    ("17_project",             "Project")),
])

# =========================================================
# 静态指南页（从 llms.txt 选，与项目 IAP 后端集成直接相关）
# =========================================================
GUIDE_PAGES = [
    # (llms.txt 中的路径, 输出文件名, 描述)
    ("integrations/webhooks",                           "webhooks",                    "Webhooks — 服务端 webhook 通知"),
    ("integrations/webhooks/event-types-and-fields",    "webhooks_event_types",        "Webhook 事件类型与字段"),
    ("integrations/webhooks/event-flows",               "webhooks_event_flows",        "常见 Webhook 流程"),
    ("integrations/webhooks/sample-events",             "webhooks_sample_events",      "Webhook 示例事件"),
    ("projects/authentication",                         "api_keys",                    "API Keys — 认证"),
    ("getting-started/entitlements",                    "entitlements",                "Entitlements — 权益概念"),
    ("projects/configuring-products",                   "configuring_products",        "配置产品/权益/商品"),
]

# =========================================================
# 辅助函数
# =========================================================
def fetch_text(url: str) -> str:
    """下载 URL 返回文本内容"""
    resp = requests.get(url, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    resp.encoding = resp.apparent_encoding or "utf-8"
    return resp.text


def safe_filename(name: str) -> str:
    """将 tag 名转为安全的文件名"""
    safe = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    return safe.lower().strip("_")


def write_md(filepath: str, content: str, source_url: str) -> None:
    """写入 Markdown 文件，带来源头"""
    header = (
        f"<!--\n"
        f"  Source: {source_url}\n"
        f"  Downloaded: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"-->\n\n"
    )
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(header)
        f.write(content.strip())
        f.write("\n")


# =========================================================
# API v2 页面处理
# =========================================================
def parse_api_v2_tag(tag_id: str):
    """解析 tag id 为 (顶级tag, 子部分) 元组"""
    # tag/Overview-(v2) → ("Overview-(v2)", None)
    # tag/Overview-(v2)/Authentication → ("Overview-(v2)", "Authentication")
    # tag/Customer/operation/get-customer → ("Customer", "operation/get-customer")
    parts = tag_id.split("/", 2)
    if len(parts) == 2:
        return parts[1], None
    elif len(parts) >= 3:
        return parts[1], parts[2]
    return None, None


def get_tag_group(tag_name: str) -> str | None:
    """获取 tag 所属的分组文件名"""
    if tag_name in TAG_GROUP_MAP:
        return TAG_GROUP_MAP[tag_name][0]
    return None


def process_api_v2(output_base: str) -> list[str]:
    """
    下载并处理 api-v2 页面，按 tag 拆分保存。
    返回输出文件列表。
    """
    print(f"=== 下载 API v2 页面: {API_V2_URL}")
    html = fetch_text(API_V2_URL)
    print(f"  HTML 大小: {len(html):,} bytes")

    soup = BeautifulSoup(html, "html.parser")
    content = soup.select_one("#__docusaurus_skipToContent_fallback")
    if not content:
        print("  ERROR: 找不到 #__docusaurus_skipToContent_fallback")
        return []

    # 收集所有 tag div
    tag_divs = content.find_all("div", id=lambda x: x and x.startswith("tag/"))
    print(f"  找到 {len(tag_divs)} 个 tag/operation 区块")

    # 按分组文件收集 HTML
    group_html: dict[str, list[str]] = {}
    for div in tag_divs:
        tag_id = div.get("id", "")
        tag_name, sub_part = parse_api_v2_tag(tag_id)
        if not tag_name:
            continue

        group_name = get_tag_group(tag_name)
        if group_name:
            if group_name not in group_html:
                group_html[group_name] = []
            group_html[group_name].append(str(div))

    # 分组内按原始顺序排列
    # 合并并转 md
    api_v2_dir = os.path.join(output_base, "api-v2")
    os.makedirs(api_v2_dir, exist_ok=True)

    output_files = []
    for group_name, divs_html in group_html.items():
        # 找这个组的显示标题
        display_title = None
        for tag_name, (gname, title) in TAG_GROUP_MAP.items():
            if gname == group_name:
                display_title = title
                break

        safe_name = safe_filename(group_name)
        filepath = os.path.join(api_v2_dir, f"{safe_name}.md")

        # 合并 HTML
        joined_html = f"<h1>{display_title or group_name}</h1>\n" + "\n".join(divs_html)

        # 转 Markdown
        markdown = md(
            joined_html,
            heading_style="ATX",
            bullets="-",
            strip=["script", "style", "nav", "footer"],
        )

        if markdown.strip():
            write_md(filepath, markdown, API_V2_URL)
            print(f"  [api-v2] → {filepath}  ({len(markdown):,} chars)")
            output_files.append(filepath)

    return output_files


# =========================================================
# 静态指南页处理
# =========================================================
def process_guide_pages(output_base: str) -> list[str]:
    """
    从 llms.txt 清单下载静态指南页（.md 后缀直接拿纯 Markdown）。
    返回输出文件列表。
    """
    guides_dir = os.path.join(output_base, "guides")
    os.makedirs(guides_dir, exist_ok=True)

    output_files = []
    for path, out_name, desc in GUIDE_PAGES:
        md_url = f"{DOCS_BASE}/docs/{path}.md"
        print(f"=== 下载指南页: {md_url}")

        try:
            text = fetch_text(md_url)

            # 检查是否真的是 Markdown（以 --- 或 # 开头）
            stripped = text.strip()
            if stripped.startswith("<!DOCTYPE") or stripped.startswith("<html"):
                print(f"  WARNING: 返回的是 HTML，不是 Markdown，跳过")
                continue

            filepath = os.path.join(guides_dir, f"{out_name}.md")
            write_md(filepath, text, md_url)
            print(f"  [guide] → {filepath}  ({len(text):,} chars)")
            output_files.append(filepath)
        except Exception as e:
            print(f"  ERROR: {e}")

    return output_files


# =========================================================
# 下载所有 llms.txt 页面（--all 模式）
# =========================================================
def process_all_llms_pages(output_base: str) -> list[str]:
    """下载 llms.txt 中列出的所有页面"""
    print(f"=== 下载 llms.txt 清单")
    text = fetch_text(LLMS_TXT_URL)

    # 提取所有 Markdown 链接
    # 格式: - [标题](https://...docs/XXX.md): 描述
    page_urls = []
    for line in text.splitlines():
        m = re.match(r"^- \[.*?\]\((https://[^)]+)\)", line)
        if m:
            url = m.group(1)
            # 只保留 docs 下的 .md 页面
            if "/docs/" in url and url.endswith(".md"):
                page_urls.append(url)

    print(f"  找到 {len(page_urls)} 个页面")

    output_files = []
    for url in page_urls:
        # 提取相对路径作为文件名
        path = urlparse(url).path
        # /docs/XXX/YYY.md → XXX/YYY.md
        rel_path = path.replace("/docs/", "", 1)
        filepath = os.path.join(output_base, "all", rel_path)

        print(f"  {url}")

        try:
            text = fetch_text(url)
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            write_md(filepath, text, url)
            output_files.append(filepath)
        except Exception as e:
            print(f"    ERROR: {e}")

    return output_files


# =========================================================
# 主入口
# =========================================================
def main():
    parser = argparse.ArgumentParser(
        description="RevenueCat 文档 → Markdown 下载器（turnMD.py 优化版）"
    )
    parser.add_argument("--output-dir", default=OUTPUT_DIR,
                        help=f"输出目录 (默认: {OUTPUT_DIR})")
    parser.add_argument("--all", action="store_true",
                        help="下载 llms.txt 中所有页面（谨慎：几十个页面）")
    parser.add_argument("--list-pages", action="store_true",
                        help="仅列出页面清单，不下载")
    parser.add_argument("--no-guides", action="store_true",
                        help="跳过指南页，只下载 api-v2")
    parser.add_argument("--no-api-v2", action="store_true",
                        help="跳过 api-v2，只下载指南页")
    args = parser.parse_args()

    output_base = os.path.abspath(args.output_dir)
    print(f"输出目录: {output_base}")
    print()

    # 页面清单
    print("=" * 60)
    print("  页面清单")
    print("=" * 60)
    print()

    # API v2 拆分文件
    print("--- API v2 (按 tag 拆分) ---")
    for tag_name, (group_name, title) in TAG_GROUP_MAP.items():
        print(f"  {group_name}.md  ← {tag_name}")
    print()

    # 指南页
    print("--- 指南页 (从 .md 后缀直接下载) ---")
    for path, out_name, desc in GUIDE_PAGES:
        print(f"  guides/{out_name}.md  ←  {path}")
    print()

    if args.list_pages:
        return

    # 下载
    all_files = []

    if not args.no_api_v2:
        print(f"{'='*60}")
        print("  Step 1: 下载 API v2 页面")
        print(f"{'='*60}")
        files = process_api_v2(output_base)
        all_files.extend(files)
        print()

    if not args.no_guides:
        print(f"{'='*60}")
        print("  Step 2: 下载指南页")
        print(f"{'='*60}")
        files = process_guide_pages(output_base)
        all_files.extend(files)
        print()

    if args.all:
        print(f"{'='*60}")
        print("  Step 3: 下载所有 llms.txt 页面")
        print(f"{'='*60}")
        files = process_all_llms_pages(output_base)
        all_files.extend(files)
        print()

    # 汇总
    print("=" * 60)
    print(f"  完成！共 {len(all_files)} 个文件")
    print(f"  输出目录: {output_base}")
    print("=" * 60)

    # 写入索引文件
    index_path = os.path.join(output_base, "README.md")
    with open(index_path, "w", encoding="utf-8") as f:
        f.write(f"# RevenueCat API 文档（AI Agent 参考）\n\n")
        f.write(f"> 下载时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"> 来源: https://www.revenuecat.com/docs/api-v2\n\n")
        f.write("## 文件清单\n\n")

        # 按目录分组
        dirs = set(os.path.dirname(f) for f in all_files)
        for d in sorted(dirs):
            rel = os.path.relpath(d, output_base)
            f.write(f"### {rel}\n\n")
            for fp in sorted(all_files):
                if os.path.dirname(fp) == d:
                    name = os.path.basename(fp)
                    size = os.path.getsize(fp)
                    f.write(f"- {name}  ({size:,} bytes)\n")
            f.write("\n")

    print(f"  索引文件: {index_path}")


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""
turnMD_asc.py — turnMD.py / turnMD_rc.py 的 App Store Connect API 文档优化版

针对 Apple 开发者文档站（developer.apple.com/documentation/AppStoreConnectAPI，
DocC 框架）的网页 → Markdown 下载器。

为什么比通用 turnMD.py 更优（沿用 turnMD_rc.py / turnMD_supabase.py 的优化思路）:
  1. Apple 官方支持 `.md` 后缀直下纯 Markdown（DocC 的 AI-agent 友好格式）——
     无需 Playwright 渲染 / BeautifulSoup 清洗。
  2. 官方同时提供 OpenAPI 规范 zip（机器可读，含全部 endpoint 的请求/响应 schema），
     属于"AI agent 专用格式"，默认一并下载并生成 endpoint 清单。
  3. 精选清单基于本项目（doctor-meets-lawyer）实际使用面调查（见 scripts/appstore/ 与
     skills/doctor-meets-lawyer-ios-release/SKILL.md）：
     App 元数据/版本/本地化、截图上传、审核提交、TestFlight、签名证书、
     地区可用性/定价、IAP、销售报告、用户与评价等；不下载无关模块（Game Center /
     Xcode Cloud / Analytics / App Clips 等，--all 可选）。
  4. 资源页自动解析 Topics 里的 GET/POST/PATCH/DELETE endpoint 子页并去重下载，
     使每个资源的完整 endpoint 参考可离线查档。

用法:
  python scripts/turnMD_asc.py                    # 下载精选清单 + endpoint 子页 + OpenAPI
  python scripts/turnMD_asc.py --list-pages        # 仅列出页面清单，不下载
  python scripts/turnMD_asc.py --output-dir docs/my_docs   # 自定义输出目录
  python scripts/turnMD_asc.py --no-openapi        # 跳过 OpenAPI 规范下载
  python scripts/turnMD_asc.py --no-endpoints      # 不自动下载 endpoint 子页
  python scripts/turnMD_asc.py --all               # 额外下载其余顶层模块页（导航）

依赖:
  pip install requests
  （.md 直下无需 BeautifulSoup / markdownify / Playwright）

官方 AI 入口:
  https://developer.apple.com/documentation/appstoreconnectapi.md
      （根页 .md；每个子页在其 URL 后加 .md 直下）
  https://developer.apple.com/sample-code/app-store-connect/app-store-connect-openapi-specification.zip
      （官方 OpenAPI 规范，zip 内为 openapi.oas (2).json，约 7MB）
"""

import argparse
import json
import os
import re
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

# Windows 控制台默认 cp1252，强制 UTF-8 输出（否则中文报错）
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import requests

# =========================================================
# 配置
# =========================================================
DOCS_BASE = "https://developer.apple.com/documentation"
API_ROOT = f"{DOCS_BASE}/appstoreconnectapi"
OPENAPI_ZIP_URL = ("https://developer.apple.com/sample-code/app-store-connect/"
                   "app-store-connect-openapi-specification.zip")
OUTPUT_DIR = "docs/appstore-connect"

REQUEST_TIMEOUT = 60
MAX_WORKERS = 8          # 并发下载数（Apple 公开 CDN，适度并发）
MAX_RETRIES = 3

# 资源页 Topics 中 endpoint 子页的链接形态：
# /documentation/AppStoreConnectAPI/GET-v1-apps
# /documentation/AppStoreConnectAPI/POST-v2-appAvailabilities-_id_ ...
ENDPOINT_RE = re.compile(
    r"/documentation/AppStoreConnectAPI/((?:GET|POST|PATCH|PUT|DELETE)-v\d+-[\w\-]+)"
)

# =========================================================
# 页面清单（基于本项目实际使用面精选，全部已核实 .md 直下可用）
# =========================================================
# 概念页：直接下载，不解析 endpoint 子页
CONCEPT_PAGES = [
    # (slug, 输出文件名, 为什么本项目需要)
    ("creating-api-keys-for-app-store-connect-api", "creating-api-keys.md",
     "创建 ASC API Key：JWT 认证前置（Key ID / Issuer ID / p8）"),
    ("generating-tokens-for-api-requests",          "generating-tokens.md",
     "生成 JWT（ES256, kid/iss/aud/exp）——所有脚本调用 API 前必读"),
    ("identifying-rate-limits",                      "rate-limits.md",
     "限流识别：脚本内置 1.5s/请求延迟的依据"),
    ("interpreting-and-handling-errors",             "errors.md",
     "错误处理：400/401/403/404/409/429 语义"),
    ("large-data-sets",                              "large-data-sets.md",
     "大数据集分页：批量查询（如全部 territory 可用性）"),
    ("uploading-assets-to-app-store-connect",        "uploading-assets.md",
     "资产上传三阶段（reservation → S3 PUT → uploaded）：截图上传实现依据"),
    ("app-store-connect-api-release-notes",          "release-notes.md",
     "API 版本发布说明：确认当前 endpoint 与旧版差异"),
    ("webhook-notifications",                        "webhook-notifications.md",
     "ASC webhook 通知：审核状态变更等（参考）"),
]

# 模块总览页：仅下载自身作为导航（Topics 链接到资源页，不解析 endpoint）
MODULE_PAGES = [
    ("app-store",                            "app-store.md",
     "App Store 模块总览：App 元数据/版本/截图/审核/IAP 资源索引"),
    ("prerelease-versions-and-beta-testers", "testflight.md",
     "TestFlight 模块总览：beta 组/测试员/构建资源索引"),
    ("auto-renewable-subscriptions",         "auto-renewable-subscriptions.md",
     "订阅模块总览：订阅组/订阅/价格资源索引（高级会员年费制）"),
]

# 资源页：下载自身 + 自动解析 Topics 中的 endpoint 子页（去重）
RESOURCE_PAGES = [
    # (slug, 输出文件名, 为什么本项目需要)
    ("apps",                                   "apps.md",
     "App 记录：app id / bundle id / 主语言（所有上架操作入口）"),
    ("app-store-versions",                     "app-store-versions.md",
     "版本管理：创建/修改版本、附加 build、发布方式"),
    ("app-store-version-localizations",        "app-store-version-localizations.md",
     "版本本地化：名称/描述/促销文案（update_promotional_text.py 目标）"),
    ("app-store-version-submissions",          "app-store-version-submissions.md",
     "版本提交审核（旧两步法，SKILL 提及）"),
    ("app-infos",                              "app-infos.md",
     "App 信息：年龄分级/隐私/类别等配置"),
    ("app-info-localizations",                 "app-info-localizations.md",
     "App 信息本地化：隐私政策 URL 等"),
    ("app-screenshot-sets",                    "app-screenshot-sets.md",
     "截图集：6.9/6.5/5.5 英寸等 display type（上架素材）"),
    ("app-screenshots",                        "app-screenshots.md",
     "截图：reservation → S3 上传三阶段（upload_screenshots_appstore.py）"),
    ("app-categories",                         "app-categories.md",
     "App 分类：get_categories.py 用"),
    ("app-availability",                       "app-availability.md",
     "可用地区 v2：仅香港上架（territory HK）"),
    ("territories",                            "territories.md",
     "地区列表：HK 等 territory 查询"),
    ("review-submissions",                     "review-submissions.md",
     "审核提交（两步法）：POST → items → submitted=true（submit_version_101.py）"),
    ("review-submission-items",                "review-submission-items.md",
     "审核提交项：关联 build/元数据/截图"),
    ("app-store-review-details",               "app-store-review-details.md",
     "审核信息：联系方式/演示账号/备注"),
    ("app-store-review-attachments",           "app-store-review-attachments.md",
     "审核附件：演示视频等"),
    ("builds",                                 "builds.md",
     "构建：build id、出口合规打标、TestFlight 状态"),
    ("app-encryption-declarations",            "app-encryption-declarations.md",
     "出口合规：usesNonExemptEncryption=false 声明"),
    ("beta-groups",                            "beta-groups.md",
     "TestFlight 组：内部/外部测试者分组"),
    ("beta-testers",                           "beta-testers.md",
     "TestFlight 测试员管理"),
    ("beta-build-localizations",               "beta-build-localizations.md",
     "TestFlight 版本说明本地化"),
    ("beta-app-review-submissions",            "beta-app-review-submissions.md",
     "TestFlight 外部测试审核提交"),
    ("beta-app-review-detail",                 "beta-app-review-detail.md",
     "TestFlight 审核详情（demo 账号等）"),
    ("build-beta-details",                     "build-beta-details.md",
     "构建的 TestFlight 详情（可测试/过期）"),
    ("certificates",                           "certificates.md",
     "分发证书：certificates.p12 对应资源"),
    ("profiles",                               "profiles.md",
     "Provisioning Profile：本项目必须新建（bundle id 不同）"),
    ("bundle-ids",                             "bundle-ids.md",
     "Bundle ID：com.richardchung.doctormeetslawyer"),
    ("devices",                                "devices.md",
     "注册设备：UDID 管理"),
    ("users",                                  "users.md",
     "用户与角色：App Manager / Developer 权限"),
    ("user-invitations",                       "user-invitations.md",
     "用户邀请"),
    ("customer-reviews",                       "customer-reviews.md",
     "客户评价：读取 App Store 评价"),
    ("customer-review-responses",              "customer-review-responses.md",
     "评价回复管理"),
    ("sales-and-finance",                      "sales-and-finance.md",
     "销售与财务报告下载"),
    ("in-app-purchase",                        "in-app-purchase.md",
     "IAP 概念页（v2 资源页见 in-app-purchases）"),
    ("in-app-purchases",                       "in-app-purchases.md",
     "IAP v2 资源：高级会员购买项管理（RevenueCat 为主，ASC 侧参考）"),
    ("subscriptions",                          "subscriptions.md",
     "订阅资源：自动续期订阅管理（高级会员年费制）"),
    ("subscription-groups",                   "subscription-groups.md",
     "订阅组：组织订阅层级"),
]

# --all 时额外下载的其余顶层模块页（仅导航，本项目未使用）
OPTIONAL_MODULES = [
    ("analytics",                                "analytics.md"),
    ("game-center",                              "game-center.md"),
    ("xcode-cloud-workflows-and-builds",         "xcode-cloud.md"),
    ("sandbox-testers",                          "sandbox-testers.md"),
    ("alternative-marketplaces-and-web-distribution", "alt-marketplaces.md"),
    ("actors",                                   "actors.md"),
    ("app-metadata",                             "app-metadata.md"),
    ("merchantids",                              "merchantids.md"),
    ("pass-type-id",                             "pass-type-id.md"),
]


# =========================================================
# 辅助函数
# =========================================================
def fetch_text(url: str, session: requests.Session | None = None) -> str:
    """下载 URL 返回文本（带重试），严格按 UTF-8 解码。"""
    sess = session or requests.Session()
    last_err: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = sess.get(url, timeout=REQUEST_TIMEOUT,
                            headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()
            return resp.content.decode("utf-8", errors="replace")
        except Exception as e:  # noqa: BLE001
            last_err = e
            if attempt < MAX_RETRIES - 1:
                time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"fetch failed: {last_err}")


def write_md(filepath: str, content: str, source_url: str) -> None:
    """写入 Markdown 文件：顶部保留 DocC 原注释块，前插来源注释。"""
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(f"<!-- Source: {source_url} | Downloaded: {stamp} -->\n")
        f.write(content.strip())
        f.write("\n")


def extract_endpoint_slugs(md_text: str) -> set[str]:
    """从资源页 .md 的 Topics 中提取 endpoint 子页 slug。"""
    return set(ENDPOINT_RE.findall(md_text))


# =========================================================
# 页面下载
# =========================================================
def download_pages(slugs: list[str], out_dir: str,
                   session: requests.Session) -> list[str]:
    """并发下载一批 slug 页面到 out_dir，返回全部相关文件路径。
    幂等：本地已存在的文件跳过下载但仍计入返回清单。"""
    files: list[str] = []
    todo = []
    for s in slugs:
        fp = os.path.join(out_dir, f"{s}.md")
        if os.path.exists(fp):
            files.append(fp)  # 已下载，跳过请求
            continue
        todo.append((s, fp))
    if not todo:
        return files

    def one(item: tuple[str, str]) -> tuple[str, str | Exception]:
        slug, fp = item
        try:
            url = f"{API_ROOT}/{slug}.md"
            text = fetch_text(url, session)
            write_md(fp, text, f"{API_ROOT}/{slug}")
            return slug, fp
        except Exception as e:  # noqa: BLE001
            return slug, e

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = [pool.submit(one, item) for item in todo]
        for fut in as_completed(futures):
            slug, result = fut.result()
            if isinstance(result, Exception):
                print(f"  ERROR {slug} -> {result}")
            else:
                files.append(result)
                print(f"  OK    {os.path.relpath(result)}")
    return files


def process_pages(output_base: str, pages: list[tuple[str, str, str]],
                  kind: str, with_endpoints: bool,
                  session: requests.Session) -> list[str]:
    """下载页面清单（kind ∈ concepts/modules/resources），
    资源页可选解析并下载 endpoint 子页。返回全部输出文件。"""
    all_files: list[str] = []
    for slug, out_name, _ in pages:
        url = f"{API_ROOT}/{slug}.md"
        text = fetch_text(url, session)
        if text.startswith("<") and "html" in text[:200].lower():
            print(f"  WARN  {slug} 返回 HTML，跳过")
            continue
        fp = os.path.join(output_base, kind, out_name)
        write_md(fp, text, url)
        all_files.append(fp)
        print(f"  OK    {kind}/{out_name}  ({len(text):,} chars)")

        if with_endpoints and kind == "resources":
            ep_slugs = extract_endpoint_slugs(text)
            if ep_slugs:
                print(f"        ├─ 发现 {len(ep_slugs)} 个 endpoint 子页")
                ep_dir = os.path.join(output_base, "endpoints")
                all_files += download_pages(sorted(ep_slugs), ep_dir, session)
    return all_files


# =========================================================
# OpenAPI 规范处理
# =========================================================
def download_openapi(output_base: str, session: requests.Session) -> list[str]:
    """下载官方 OpenAPI 规范 zip，解压为 openapi.json，并生成 endpoint 清单。"""
    files: list[str] = []
    openapi_dir = os.path.join(output_base, "openapi")
    os.makedirs(openapi_dir, exist_ok=True)

    print("=== 下载 OpenAPI 规范 (官方机器可读格式)")
    resp = session.get(OPENAPI_ZIP_URL, timeout=REQUEST_TIMEOUT,
                       headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    zip_path = os.path.join(openapi_dir, "_openapi.zip")
    with open(zip_path, "wb") as f:
        f.write(resp.content)
    print(f"  OK    下载 zip ({len(resp.content):,} bytes)")

    json_path = os.path.join(openapi_dir, "openapi.json")
    with zipfile.ZipFile(zip_path) as z:
        # zip 内文件名可能是 'openapi.oas (2).json'（含空格括号）
        member = next(n for n in z.namelist() if n.endswith(".json") and not n.startswith("__MACOSX"))
        with z.open(member) as src, open(json_path, "wb") as dst:
            dst.write(src.read())
    os.remove(zip_path)
    files.append(json_path)
    print(f"  OK    openapi/openapi.json")

    # 生成 endpoint 清单（path → method → summary），供 agent 快速浏览
    with open(json_path, encoding="utf-8") as f:
        spec = json.load(f)
    endpoints_md = os.path.join(openapi_dir, "endpoints.md")
    paths = sorted(spec.get("paths", {}))

    # 已下载 endpoint 文件（按 DocC slug 命名）
    ep_dir = os.path.join(output_base, "endpoints")
    downloaded = set(os.listdir(ep_dir)) if os.path.isdir(ep_dir) else set()

    def slug_for(method: str, path: str) -> str:
        """由 HTTP 方法 + path 推导 DocC slug：/v1/apps/{id} → GET-v1-apps-_id_"""
        p = path.replace("/relationships/", "-relationships-")
        p = re.sub(r"\{([^}]+)\}", r"_\1_", p)
        return f"{method.upper()}{p.replace('/', '-')}.md"

    lines = [
        "# App Store Connect API — Endpoint 清单",
        "",
        f"> 由 openapi.json 自动生成（{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}）",
        f"> 路径数: {len(paths)}；已下载详细页: {len(downloaded)} 个（docs/appstore-connect/endpoints/）",
        "",
        "按 path 排序。`<link>` 指向已下载的 DocC 详细页（请求/响应 schema）；",
        "未下载的可直接查 `openapi.json` 对应 path。",
        "",
    ]
    for path in paths:
        methods = spec["paths"][path]
        lines.append(f"## `{path}`")
        for method in ("get", "post", "put", "patch", "delete"):
            op = methods.get(method)
            if not op:
                continue
            summary = op.get("summary", "").strip()
            op_id = op.get("operationId", "")
            slug_fn = slug_for(method, path)
            link = f" [`{slug_fn}`](../endpoints/{slug_fn})" if slug_fn in downloaded else ""
            lines.append(f"- **{method.upper()}** `{op_id}`{link} — {summary}")
        lines.append("")
    with open(endpoints_md, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    files.append(endpoints_md)
    print(f"  OK    openapi/endpoints.md  ({len(lines):,} lines)")
    return files


# =========================================================
# 索引
# =========================================================
def write_index(output_base: str, all_files: list[str]) -> str:
    """生成 README.md 索引。"""
    index_path = os.path.join(output_base, "README.md")
    with open(index_path, "w", encoding="utf-8") as f:
        f.write("# App Store Connect API 官方文档（AI Agent 参考）\n\n")
        f.write("> 适用项目: doctor-meets-lawyer（Expo RN iOS 上架，仅香港区）\n")
        f.write(f"> 下载时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("> 来源: https://developer.apple.com/documentation/appstoreconnectapi\n")
        f.write("> 格式: 官方 DocC `.md` 直下 + 官方 OpenAPI 规范（AI-agent 友好）\n\n")
        f.write("## 选用原则\n\n")
        f.write("基于本项目代码/CI 实际使用面挑选（见 scripts/turnMD_asc.py 清单注释）：\n")
        f.write("- **认证**: API Key / JWT（ES256）—— 所有脚本调用前置\n")
        f.write("- **App 元数据**: apps / appStoreVersions / 本地化 / App 信息\n")
        f.write("- **素材上传**: appScreenshotSets / appScreenshots（三阶段 S3 上传）\n")
        f.write("- **审核提交**: reviewSubmissions 两步法 / review 详情与附件\n")
        f.write("- **TestFlight**: beta 组 / 测试员 / 构建 / 外部审核\n")
        f.write("- **签名与用户**: certificates / profiles / bundleIds / users\n")
        f.write("- **定价与地区**: appAvailability（仅 HK）/ territories\n")
        f.write("- **IAP/订阅**: in-app-purchases(v2) / subscriptions / subscription-groups\n")
        f.write("- **未下载**: Game Center / Xcode Cloud / Analytics 等（--all 可选）\n\n")
        f.write("## 目录结构\n\n")
        f.write("- `concepts/` — 概念页（认证/限流/错误/资产上传/发布说明）\n")
        f.write("- `modules/` — 模块总览导航页（App Store / TestFlight）\n")
        f.write("- `resources/` — 资源页（每个资源的概述 + endpoint 索引）\n")
        f.write("- `endpoints/` — 具体 endpoint 页（请求/响应细节），文件名为 DocC slug（如 GET-v1-apps.md）\n")
        f.write("- `openapi/` — 官方 OpenAPI 规范 + endpoint 清单\n\n")
        f.write("## 文件清单\n\n")

        dirs = sorted(set(os.path.dirname(x) for x in all_files))
        for d in dirs:
            rel = os.path.relpath(d, output_base)
            f.write(f"### {rel}\n\n")
            for fp in sorted(all_files):
                if os.path.dirname(fp) == d:
                    size = os.path.getsize(fp)
                    f.write(f"- {os.path.basename(fp)}  ({size:,} bytes)\n")
            f.write("\n")
    return index_path


# =========================================================
# 主入口
# =========================================================
def main():
    parser = argparse.ArgumentParser(
        description="App Store Connect API 官方文档 → Markdown 下载器（turnMD.py 优化版）"
    )
    parser.add_argument("--output-dir", default=OUTPUT_DIR,
                        help=f"输出目录 (默认: {OUTPUT_DIR})")
    parser.add_argument("--list-pages", action="store_true",
                        help="仅列出页面清单，不下载")
    parser.add_argument("--no-openapi", action="store_true",
                        help="跳过 OpenAPI 规范下载")
    parser.add_argument("--no-endpoints", action="store_true",
                        help="不自动下载资源页的 endpoint 子页")
    parser.add_argument("--all", action="store_true",
                        help="额外下载其余顶层模块页（导航）")
    args = parser.parse_args()

    output_base = os.path.abspath(args.output_dir)

    print("=" * 60)
    print("  页面清单")
    print("=" * 60)
    print(f"\n--- 概念页 ({len(CONCEPT_PAGES)}) ---")
    for slug, out, desc in CONCEPT_PAGES:
        print(f"  concepts/{out}  ← {slug}")
    print(f"\n--- 模块总览页 ({len(MODULE_PAGES)}) ---")
    for slug, out, desc in MODULE_PAGES:
        print(f"  modules/{out}  ← {slug}")
    print(f"\n--- 资源页 ({len(RESOURCE_PAGES)}) ---")
    for slug, out, desc in RESOURCE_PAGES:
        ep = " + endpoints" if not args.no_endpoints else ""
        print(f"  resources/{out}{ep}  ← {slug}")
    if args.all:
        print(f"\n--- 可选模块页 ({len(OPTIONAL_MODULES)}) ---")
        for slug, out in OPTIONAL_MODULES:
            print(f"  modules/{out}  ← {slug}")
    if not args.no_openapi:
        print("\n--- OpenAPI ---")
        print(f"  openapi/openapi.json  ← {OPENAPI_ZIP_URL}")
        print(f"  openapi/endpoints.md  ← 从 openapi.json 生成")
    print()

    if args.list_pages:
        return

    session = requests.Session()
    all_files: list[str] = []

    print("=" * 60)
    print("  Step 1: 概念页")
    print("=" * 60)
    all_files += process_pages(output_base, CONCEPT_PAGES, "concepts", False, session)

    print()
    print("=" * 60)
    print("  Step 2: 模块总览页")
    print("=" * 60)
    all_files += process_pages(output_base, MODULE_PAGES, "modules", False, session)

    print()
    print("=" * 60)
    print("  Step 3: 资源页 (+ endpoint 子页)")
    print("=" * 60)
    all_files += process_pages(output_base, RESOURCE_PAGES, "resources",
                               not args.no_endpoints, session)

    if args.all:
        print()
        print("=" * 60)
        print("  Step 4: 可选模块页")
        print("=" * 60)
        opt = [(slug, out, "") for slug, out in OPTIONAL_MODULES]
        all_files += process_pages(output_base, opt, "modules", False, session)

    if not args.no_openapi:
        print()
        print("=" * 60)
        print("  Step 5: OpenAPI 规范")
        print("=" * 60)
        try:
            all_files += download_openapi(output_base, session)
        except Exception as e:  # noqa: BLE001
            print(f"  ERROR OpenAPI 下载失败（可 --no-openapi 跳过）: {e}")

    # 汇总（同一 endpoint 可能被多个资源页发现，先去重）
    all_files = list(dict.fromkeys(all_files))
    total = len(all_files)
    print()
    print("=" * 60)
    print(f"  完成！共 {total} 个文件")
    print(f"  输出目录: {output_base}")
    print("=" * 60)

    index_path = write_index(output_base, all_files)
    print(f"  索引文件: {index_path}")


if __name__ == "__main__":
    main()

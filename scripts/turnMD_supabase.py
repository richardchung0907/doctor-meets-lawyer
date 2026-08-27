#!/usr/bin/env python3
"""
turnMD_supabase.py — turnMD.py / turnMD_rc.py 的 Supabase 文档优化版

针对 Supabase 官方文档站 (supabase.com/docs) 的网页 → Markdown 下载器。

为什么比通用 turnMD.py 更优（沿用 turnMD_rc.py 的优化思路）:
  1. Supabase 官方提供 AI-agent 专用格式：根路径 `https://supabase.com/llms.txt`
     索引 + 每个页面支持 `.md` 后缀直下纯 Markdown —— 无需 Playwright 渲染。
  2. 精选清单基于本项目（doctor-meets-lawyer）实际使用面调查：
     Auth / Data REST API / Realtime / Database(RLS·触发器·函数) / Edge Functions /
     Local Development(CLI·迁移)，不下载无关模块（Storage / GraphQL / AI 等）。
  3. `llms/js.txt` 是 supabase-js 客户端+服务端方法完整参考（~160KB），
     AI agent 改/写客户端代码时的第一查档来源。

用法:
  python scripts/turnMD_supabase.py              # 下载精选清单到 docs/supabase
  python scripts/turnMD_supabase.py --list-pages  # 仅列出页面清单，不下载
  python scripts/turnMD_supabase.py --output-dir docs/my_docs   # 自定义输出目录
  python scripts/turnMD_supabase.py --all         # 额外下载 llms.txt 全部顶层指南页

依赖:
  pip install requests
  （.md 直下无需 BeautifulSoup / markdownify / Playwright）

官方 AI 入口:
  https://supabase.com/llms.txt         （顶层指南索引，每页 .md 直下）
  https://supabase.com/llms/js.txt      （supabase-js 参考）
  https://supabase.com/llms-full.txt    （全部文档单文件，~6.6MB，不按需加载）
"""

import argparse
import os
import re
import sys
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
DOCS_BASE = "https://supabase.com"
LLMS_TXT_URL = f"{DOCS_BASE}/llms.txt"
LLMS_JS_URL = f"{DOCS_BASE}/llms/js.txt"
OUTPUT_DIR = "docs/supabase"

REQUEST_TIMEOUT = 120

# =========================================================
# 精选页面清单
# =========================================================
# 每项: (官方相对路径, 输出相对路径, 为什么本项目需要)
# 全部已核实支持 `.md` 后缀直下（2026-08-21）。
GUIDE_PAGES = [
    # --- Data REST API (PostgREST) ---
    ("guides/api",                                    "guides/api.md",
     "Data REST API 概念：.from().select/insert/update/delete、filter、rpc"),
    ("guides/api/rest/postgrest-error-codes",         "guides/api/rest/postgrest-error-codes.md",
     "PostgREST 错误码：客户端查询报错时查档"),

    # --- Auth ---
    ("guides/auth",                                   "guides/auth.md",
     "Auth 概述：signUp / signInWithPassword / signOut / getSession / onAuthStateChange"),
    ("guides/auth/architecture",                      "guides/auth/architecture.md",
     "Auth 架构：auth.users ↔ public.profiles 关联机制"),
    ("guides/auth/managing-user-data",                "guides/auth/managing-user-data.md",
     "user metadata：signUp options.data 写入 profession/username/gender/age/bio"),
    ("guides/auth/passwords",                         "guides/auth/passwords.md",
     "邮箱密码登录：项目唯一登录方式"),
    ("guides/auth/users",                             "guides/auth/users.md",
     "用户管理：auth.users 字段与查询（RC webhook 校验用户）"),
    ("guides/auth/sessions",                          "guides/auth/sessions.md",
     "会话生命周期：getSession / onAuthStateChange 行为"),

    # --- Database (SQL / RLS / 触发器 / 函数) ---
    ("guides/database",                               "guides/database.md",
     "Database 概述：表、视图、RLS、扩展"),
    ("guides/database/secure-data",                   "guides/database/secure-data.md",
     "Row Level Security：迁移文件里大量 RLS 策略、auth.uid()"),
    ("guides/database/postgres/triggers",             "guides/database/postgres/triggers.md",
     "触发器：notify_new_message、profiles 自动创建触发器"),
    ("guides/database/functions",                     "guides/database/functions.md",
     "Postgres 函数：notify_new_message 为 plpgsql SECURITY DEFINER"),
    ("guides/database/api",                           "guides/database/api.md",
     "数据库对象 → REST API 自动映射"),
    ("guides/database/connecting-to-postgres",        "guides/database/connecting-to-postgres.md",
     "直接连 Postgres（scripts/apply_migration.js 用 Supavisor pooler）"),
    ("guides/database/postgres/indexes",              "guides/database/postgres/indexes.md",
     "索引：查询性能（conversations/messages 查询）"),

    # --- Realtime ---
    ("guides/realtime",                               "guides/realtime.md",
     "Realtime 概述"),
    ("guides/realtime/postgres-changes",              "guides/realtime/postgres-changes.md",
     "聊天室核心：postgres_changes 订阅 messages/conversations 变更"),
    ("guides/realtime/authorization",                 "guides/realtime/authorization.md",
     "Realtime 与 RLS：频道授权"),
    ("guides/realtime/limits",                        "guides/realtime/limits.md",
     "Realtime 配额与限制"),

    # --- Edge Functions ---
    ("guides/functions",                              "guides/functions.md",
     "Edge Functions 概述：Deno + supabase-js 服务端"),
    ("guides/functions/background-tasks",             "guides/functions/background-tasks.md",
     "pg_net 后台任务：notify 由 DB 触发器 fire-and-forget 调用的模式"),
    ("guides/functions/auth",                         "guides/functions/auth.md",
     "函数内认证：anon/service-role key 与 JWT（rc-webhook 鉴权）"),
    ("guides/functions/deploy",                       "guides/functions/deploy.md",
     "部署：npx supabase functions deploy notify 等"),
    ("guides/functions/secrets",                      "guides/functions/secrets.md",
     "环境变量 / secrets（SUPABASE_URL / SERVICE_ROLE_KEY）"),
    ("guides/functions/error-handling",               "guides/functions/error-handling.md",
     "Edge Function 错误处理"),
    ("guides/functions/status-codes",                 "guides/functions/status-codes.md",
     "HTTP 状态码约定"),
    ("guides/functions/connect-to-postgres",          "guides/functions/connect-to-postgres.md",
     "Edge Function 内连接 Postgres"),

    # --- Local Development / CLI ---
    ("guides/local-development",                      "guides/local-development.md",
     "本地开发概述"),
    ("guides/local-development/cli/getting-started",  "guides/local-development/cli/getting-started.md",
     "CLI 入门：login / link / functions deploy"),
    ("guides/local-development/database-migrations",  "guides/local-development/database-migrations.md",
     "数据库迁移流程（supabase/migrations/*.sql）"),

    # --- Security / Platform ---
    ("guides/security",                               "guides/security.md",
     "安全概述（API keys、RLS 最佳实践）"),
    ("guides/platform",                               "guides/platform.md",
     "平台概念：项目、API URL、keys"),
]

# 额外直接下载的官方 AI 参考文件（非 guides 页面）
# 每项: (完整 URL, 输出相对路径, 描述)
REFERENCE_FILES = [
    (LLMS_JS_URL, "reference/js.md",
     "supabase-js 完整方法参考（auth / data / realtime / storage）—— AI agent 写客户端代码第一查档来源"),
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


def is_html(text: str) -> bool:
    """判断内容是否为 HTML（.md 404 时会返回错误页 HTML）"""
    stripped = text.strip().lstrip("\ufeff")
    return stripped.startswith("<!DOCTYPE") or stripped.startswith("<html")


# =========================================================
# 下载处理
# =========================================================
def process_guide_pages(output_base: str) -> list[str]:
    """从精选清单下载指南页（官方 .md 后缀直下）"""
    print("--- 指南页 (.md 直下) ---")
    output_files = []

    for md_path, out_path, desc in GUIDE_PAGES:
        md_url = f"{DOCS_BASE}/docs/{md_path}.md"
        filepath = os.path.join(output_base, out_path)

        try:
            text = fetch_text(md_url)
            if is_html(text):
                print(f"  WARN  {md_path}.md 返回 HTML（官方可能改版），跳过")
                continue
            write_md(filepath, text, md_url)
            print(f"  OK    {out_path}  ({len(text):,} chars)  — {desc}")
            output_files.append(filepath)
        except Exception as e:
            print(f"  ERROR {md_path}.md -> {e}")

    return output_files


def process_reference_files(output_base: str) -> list[str]:
    """下载官方 AI 参考文件（llms/js.txt 等）"""
    print("--- 参考文件 ---")
    output_files = []

    for url, out_path, desc in REFERENCE_FILES:
        filepath = os.path.join(output_base, out_path)
        try:
            text = fetch_text(url)
            if is_html(text):
                print(f"  WARN  {url} 返回 HTML，跳过")
                continue
            write_md(filepath, text, url)
            print(f"  OK    {out_path}  ({len(text):,} chars)  — {desc}")
            output_files.append(filepath)
        except Exception as e:
            print(f"  ERROR {url} -> {e}")

    return output_files


def process_all_llms_pages(output_base: str) -> list[str]:
    """--all 模式：下载 llms.txt 中全部顶层指南页（谨慎：约 20+ 页）"""
    print("--- llms.txt 全部顶层指南页 (--all) ---")
    text = fetch_text(LLMS_TXT_URL)
    output_files = []

    # 匹配 llms.txt 中的链接行: - [标题](https://supabase.com/docs/guides/xxx.md)
    pattern = re.compile(r"^- \[.*?\]\((https://supabase\.com/docs/guides/[^)]+\.md)\)", re.M)
    for m in pattern.finditer(text):
        url = m.group(1)
        rel_path = url.replace(f"{DOCS_BASE}/docs/", "", 1)  # guides/xxx.md
        filepath = os.path.join(output_base, "all", rel_path)
        try:
            t = fetch_text(url)
            if is_html(t):
                print(f"  WARN  {rel_path} 返回 HTML，跳过")
                continue
            write_md(filepath, t, url)
            print(f"  OK    all/{rel_path}  ({len(t):,} chars)")
            output_files.append(filepath)
        except Exception as e:
            print(f"  ERROR {rel_path} -> {e}")

    return output_files


def write_index(output_base: str, all_files: list[str]) -> str:
    """生成 README.md 索引"""
    index_path = os.path.join(output_base, "README.md")
    with open(index_path, "w", encoding="utf-8") as f:
        f.write("# Supabase 官方文档（AI Agent 参考）\n\n")
        f.write("> 适用项目: doctor-meets-lawyer（Expo RN + supabase-js + Edge Functions）\n")
        f.write(f"> 下载时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"> 来源: https://supabase.com/llms.txt（官方 AI-agent 格式，每页 .md 直下）\n")
        f.write(f"> 全量单文件: https://supabase.com/llms-full.txt（约 6.6MB，按需不采用）\n\n")
        f.write("## 选用原则\n\n")
        f.write("基于本项目代码实际使用面挑选（见 scripts/turnMD_supabase.py GUIDE_PAGES 注释）：\n")
        f.write("- **Auth**: 邮箱密码登录、user metadata、profiles 关联、会话管理\n")
        f.write("- **Data REST API**: .from().select/insert/update/delete、rpc、错误码\n")
        f.write("- **Database**: RLS 策略、触发器、Postgres 函数、直连 Postgres、索引\n")
        f.write("- **Realtime**: 聊天室 postgres_changes 订阅、授权、限额\n")
        f.write("- **Edge Functions**: notify/simulate/rc-webhook、pg_net 后台任务、部署/secrets\n")
        f.write("- **CLI/迁移**: supabase functions deploy、database migrations\n")
        f.write("- **未下载**: Storage / GraphQL / AI / 自助托管等（本项目未使用）\n\n")
        f.write("## 文件清单\n\n")

        dirs = sorted(set(os.path.dirname(x) for x in all_files))
        for d in dirs:
            rel = os.path.relpath(d, output_base)
            f.write(f"### {rel}\n\n")
            for fp in sorted(all_files):
                if os.path.dirname(fp) == d:
                    name = os.path.basename(fp)
                    size = os.path.getsize(fp)
                    f.write(f"- {name}  ({size:,} bytes)\n")
            f.write("\n")
    return index_path


# =========================================================
# 主入口
# =========================================================
def main():
    parser = argparse.ArgumentParser(
        description="Supabase 官方文档 → Markdown 下载器（turnMD.py 优化版）"
    )
    parser.add_argument("--output-dir", default=OUTPUT_DIR,
                        help=f"输出目录 (默认: {OUTPUT_DIR})")
    parser.add_argument("--list-pages", action="store_true",
                        help="仅列出页面清单，不下载")
    parser.add_argument("--all", action="store_true",
                        help="额外下载 llms.txt 中全部顶层指南页（谨慎）")
    args = parser.parse_args()

    output_base = os.path.abspath(args.output_dir)
    print(f"输出目录: {output_base}")
    print()
    print("=" * 60)
    print("  页面清单")
    print("=" * 60)
    print()
    print("--- 指南页 ---")
    for md_path, out_path, desc in GUIDE_PAGES:
        print(f"  {out_path:55s} ← {md_path}.md")
    print()
    print("--- 参考文件 ---")
    for url, out_path, desc in REFERENCE_FILES:
        print(f"  {out_path:55s} ← {url}")
    print()
    if args.all:
        print("  + --all: llms.txt 全部顶层指南页 → all/ 子目录")
        print()

    if args.list_pages:
        return

    # 下载
    all_files = []
    all_files += process_reference_files(output_base)
    all_files += process_guide_pages(output_base)
    if args.all:
        all_files += process_all_llms_pages(output_base)

    # 汇总
    print()
    print("=" * 60)
    print(f"  完成！共 {len(all_files)} 个文件")
    print(f"  输出目录: {output_base}")
    print("=" * 60)

    index_path = write_index(output_base, all_files)
    print(f"  索引文件: {index_path}")


if __name__ == "__main__":
    main()

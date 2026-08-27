---
name: doctor-meets-lawyer-revenuecat-docs
description: 维护本地 RevenueCat 文档镜像（docs/revenuecat/）的工具与站点特性记录。脚本 scripts/turnMD_rc.py（turnMD.py 的 RevenueCat 优化版）把官网文档下载为 md 文件供 AI agent 离线查询。涵盖：文档站技术栈（Docusaurus SSR + llms.txt + .md 后缀 + Stoplight api-v2 大页）、下载/更新 SOP、踩坑记录。需要查询或更新 RevenueCat API/Webhook 文档时先读。
invocation: model+user
---

# RevenueCat 文档镜像（docs/revenuecat/）维护手册

## When to use

- 需要离线查询 RevenueCat API / Webhook 文档：直接读 `docs/revenuecat/`（比官网更快、可离线）
- 需要重新下载 / 更新文档镜像：按本文 SOP 跑 `scripts/turnMD_rc.py`
- 注意：`docs/revenuecat/` 已被 `.gitignore` 忽略（本地专用，换机需连同 `keys.txt` 手动带走）

## 30 秒速览

- 镜像位置：`docs/revenuecat/` → `api-v2/`（18 个按资源拆分的文件）+ `guides/`（7 个指南页）+ `README.md` 索引
- 下载工具：`scripts/turnMD_rc.py`（幂等，可重跑；依赖 `pip install requests beautifulsoup4 markdownify`）
- 官网特性：`llms.txt` 提供全站页面清单；静态指南页支持 `.md` 后缀直接拿纯净 Markdown；`api-v2` 是 Docusaurus SSR 单页大文档（curl 直接拿全 HTML，无需浏览器）

## 技术栈与站点特性（RevenueCat docs，2026-08-21 实测）

- Docusaurus v3.10.1 + Stoplight Elements（OpenAPI 渲染）
- `https://www.revenuecat.com/docs/llms.txt`：全站页面清单（Markdown 链接格式）
- 静态指南页 `https://www.revenuecat.com/docs/xxx.md`：直接返回纯净 Markdown（带 frontmatter + "AI agents" 提示）
- `https://www.revenuecat.com/docs/api-v2`：OpenAPI 单页大文档（SSR，3.16MB HTML / 344KB 文本）；内容在 `#__docusaurus_skipToContent_fallback`，按 `div[id^="tag/"]` 分组可拆成按资源的文件
- api-v2 的 tag 分组：General（Overview/Pagination/Rate-Limit/Expandables/Error-Handling/Representation/Subscription-Data-Model）+ 17 个资源（Audience/App/Customer/Entitlement/Offering/Package/Product/Purchase/Subscription/Invoice/Paywall/Integration/Project 等）

## 使用 SOP

```powershell
# 下载 / 更新镜像（默认：api-v2 拆分 18 文件 + 7 个指南页）
python scripts/turnMD_rc.py
# 仅列出页面清单不下载
python scripts/turnMD_rc.py --list-pages
# 下载 llms.txt 全部页面（几十个，谨慎）
python scripts/turnMD_rc.py --all
```

- 输出：`docs/revenuecat/` + 自动生成 `README.md` 索引（含下载时间、来源、文件清单）
- `scripts/turnMD_rc.py` 的 `GUIDE_PAGES` 清单可增删指南页；`TAG_GROUP_MAP` 决定 api-v2 拆分方式

## 踩坑记录

1. `.md` 后缀对**静态指南页有效**（`webhooks.md` 返回纯 md），但 **`api-v2.md` 返回 404 HTML**——api-v2 是 OpenAPI 动态页，必须抓整页 HTML 再解析。
2. Playwright `goto(..., wait_until="networkidle")` 在 api-v2 页会超时（页面有持续 analytics 长连接）——**不需要浏览器**，curl/requests 直接拿 SSR HTML 即可。
3. api-v2 页面没有 `<main>` 元素——内容在 `#__docusaurus_skipToContent_fallback`；提取主要内容的 selector 不能照搬通用爬虫。
4. api-v2 单页 344KB 文本对 agent 太大——按 `tag/` div 拆分为 18 个资源文件，agent 按需加载对应资源。
5. Stoplight 的代码块用特殊 div 结构（非 `<pre>`），markdownify 会转成列表格式（`- "key": value`）——信息完整可读，可接受，不必强行还原代码块。
6. Windows 控制台 cp1252：脚本开头必须 `sys.stdout.reconfigure(encoding="utf-8")`，否则 print 中文 UnicodeEncodeError。
7. 文档里展示的 schema 与实际 API 校验**可能有出入**（如 Test Store product 的 title 字段位置）——以 API 实测为准，出入清单见 `doctor-meets-lawyer-iap` skill 的「踩坑记录」。

## 相关

- 用这些文档做 RevenueCat 后台操作（API 端点、幂等写法、后台现状 ID）：见 `doctor-meets-lawyer-iap` skill
- 更新时机：RevenueCat API 变更时重跑即可；若官网 tag 分组结构变化，需同步调整 `turnMD_rc.py` 的 `TAG_GROUP_MAP`

---
name: doctor-meets-lawyer-ios-release
description: 本项目 iOS 自动编译 + App Store 上架（仅香港）的资料库与踩坑手册。含：从另一项目'C:\Users\User\Desktop\MYproject\Filter_APP2'（richy-Lite，已成功上架全球 App Store 的 Flutter 专案）移植的账号级凭据、证书、App Store Connect 自动化脚本与 CI 方案的适配记录；Expo SDK 52 在 GitHub Actions macOS runner 上的构建链路（prebuild → pod install → xcodebuild → TestFlight）；App Store Connect REST API（JWT ES256）自动提交审核；以及"仅香港区"上架、下一步行动清单与已知踩坑。
invocation: model+user
---

# Doctor Meets Lawyer — iOS 编译与 App Store 上架手册

## When to use

接手本仓库的 iOS 构建 / TestFlight 上传 / App Store 上架任务时**先读**。Android 侧另见 `doctor-meets-lawyer-android-build` 与 `doctor-meets-lawyer-env` skill。

## 30 秒速览（现状 2026-08-22 晚场二次实测）

- **已完成（2026-08-22 两次实测，全部 API 验证）**：
  - 注册本项目 bundle id `com.richardchung.doctormeetslawyer`（id `ABRWS5243T`，UNIVERSAL）。
  - 创建本项目 provisioning profile `Doctor Meets Lawyer App Store Profile`（id `9K78S6H67G`，ACTIVE，uuid `6131c380-6608-43bc-8ca3-2129fdd44a2a`），已存 `ios-signing/doctor_meets_lawyer_app_store.mobileprovision`；本地文件 uuid 与后台一致，entitlements（beta-reports-active / application-identifier 等）正确，keys.txt 的 `IOS_PROVISIONING_PROFILE_NAME` 已同步。
  - 上传 8 个 GitHub Actions secrets（`setup_github_secrets.py` 全绿，Android 段自动跳过）。
  - 发布隐私政策 `https://richardchung0907.github.io/doctor-meets-lawyer/privacy-policy.html`（GitHub Pages，实测 200）。
  — **App 记录已创建**：id `6804181628`（name=Doctor Meets Lawyer / sku=doctor-meets-lawyer / primaryLocale=en-US）。网页创建（2026 API 禁止 `POST /v1/apps`，403）后 `setup_appstore.py create` 幂等收尾**已全部落地并实测通过**：版本 1.0.0（PREPARE_FOR_SUBMISSION + copyright）、三语言元数据（en-US whatsNew 留空为已知锁定）、分类 SOCIAL_NETWORKING/BUSINESS、年龄分级已完整设定（medicalOrTreatmentInformation=INFREQUENT_OR_MILD + healthOrWellnessTopics=true + 27 字段全部如实申报，见下方差旅）、审核详情、三语言 privacyPolicyUrl 绑定（HTTP 200）、仅香港 availability（175 TA，仅 HKG enabled，availableInNewTerritories=false）。
  - 签名资产一致性实测：`certificates.p12` ↔ `distribution.cer` ↔ `distribution.pem` SHA256 指纹一致（`8ad46f4d...`），p12 密码正确，证书 2027-07-17 到期（与后台 serial `9CD798C4...` 对应）。
  - 空值扫描修复（2026-08-22 晚场 `_null_scan.py` 扫描 39 NULL + 15 EMPTY 后分类处理）：`App.contentRightsDeclaration` 从 None 修为 `DOES_NOT_USE_THIRD_PARTY_CONTENT`（UGC 平台无第三方授权内容）；`Version.usesIdfa` 从 None 修为 `false`（无广告无 IDFA）。其余 NULL/EMPTY 经逐一判定为正常空或既有待办（见下）。
- **尚未完成（提交审核前必须处理）**：
  - **TestFlight 无 build**：GitHub Actions `build-ios.yml` 历史 runs=0，从未触发构建；版本 1.0.0 未关联 build。
  - **无截图**：三语言 appScreenshotSets 全空；现有素材仅为 Android QA 测试图，需 iOS 版正式截图（6.5" 一组，建议加 6.9"）。
  - **价格计划未设置**：`appPriceSchedule` manualPrices/automaticPrices 均 0（baseTerritory=USA），后台「定价与可用性」价格部分未保存过。
  - **出口合规声明未创建**：`appEncryptionDeclarations` 0 条；build 上传后需创建豁免声明并关联（app.json 已设 usesNonExemptEncryption=false）。
  - **`submit_version_101.py` 仍是对方 App 模板**：build id `40bfbf4f-d03d-4804-b549-ff4510f4df22` 是 RICHY 的 Build 20、whatsNew 是 10 语言、审核备注讲 AdMob/Appodeal/ATT——跑之前必须换成本项目值。
  - 需网页确认（API 不可查）：App 图标 1024×1024、App 隐私标签（App Privacy）、第三方内容权利声明（contentRightsDeclaration）。
- 技术栈差异：本项目是 **Expo SDK 52**（对方是 Flutter），构建方式不同，但签名、TestFlight 上传、App Store Connect 上架链路完全可复用。

## 目录安放（本轮做了什么）

| 位置 | 内容 | git |
|---|---|---|
| `ios-signing/` | `AuthKey_LSLS88W574.p8`（ASC API 私钥）、`certificates.p12`（Apple Distribution 证书）、`distribution.cer/pem`、`ios_distribution.key` | 忽略 |
| `ios-signing/reference/` | `Richy_Lite_App_Store_Profile.mobileprovision`（**对方 App 专用，仅结构参考，不可用于本项目**） | 忽略 |
| `keys.txt` | 合并了 5 个 ASC 相关 key（Issuer ID / Key ID / 证书密码 / profile 名 / p12 base64），保留原有 Github key | 忽略 |
| `.github/workflows/build-ios.yml` | Expo iOS 构建 + TestFlight 上传（新写，基于对方 `ios-release.yml` 方案适配） | 入库 |
| `.github/ios/ExportOptions.plist` | export 模板（CI 用 plutil 替换 profile 名） | 入库 |
| `scripts/appstore/` | 10 个 ASC 自动化脚本（已做路径适配，语法校验通过）+ README；2026-08-22 新增 4 个只读审计脚本：`_full_audit.py`（全量 14 项）/ `_extra_checks.py`（价格+beta+CI runs）/ `_verify_signing.py`（签名资产一致性）/ `_null_scan.py`（全资源空值扫描：NULL/EMPTY/NONE 分类）+ `_fix_nulls.py`（修复 contentRightsDeclaration / usesIdfa）+ `_set_age_rating.py`（年龄分级完整申报） | 忽略（*.py） |
| `docs/appstore/` | `app_store_connect_settings.md`（对方 ASC 账号全景快照，含邮箱等，敏感） | 忽略 |
| `docs/appstore-connect/` | ASC API 官方文档离线镜像（AI agent 查档用，`scripts/turnMD_asc.py` 下载） | 忽略 |
| `app.json` | 新增 `ios.bundleIdentifier=com.richardchung.doctormeetslawyer`、`ios.config.usesNonExemptEncryption=false` | 入库 |

**未拷贝（有意排除）**：Appodeal 广告 SDK 相关（keys 行、`appodeal_dataprotection/`、`appodeal_api_handler.py`、`appodeal_backend_audit.md`）——本项目无广告；对方的多语言元数据文案与截图（对方 App 专用）；`request.certSigningRequest`（历史 CSR 无用）。对方专案未做任何改动（只读拷贝）。

## 账号与凭据事实（来自 Filter_APP2，账号级 = 对本项目同样有效）

- Apple 开发者账号：`richardchung_0907@hotmail.com`，**Team ID `3W8574PF9N`**（Account Holder）。
- App Store Connect API Key：**Key ID `LSLS88W574`**，Issuer ID `187d04be-5a43-4f06-90b5-5a7072acdc72`，私钥 `ios-signing/AuthKey_LSLS88W574.p8`。此 key 是账号级，**本项目可直接使用**（前提：该 key 在 App Store Connect 里被授予 App Manager/Developer 角色）。
- 分发证书：`Apple Distribution: Ka Chai CHUNG`，证书 ID `9NYCT2Q8LA`，**2027-07-17 到期**，`ios-signing/certificates.p12`（密码在 `keys.txt` 的 `IOS_BUILD_CERTIFICATE_PASSWORD`）。分发证书是账号级，**本项目可复用**。
- provisioning profile：本项目的 `Doctor Meets Lawyer App Store Profile` 已创建（2026-08-22），绑定 `com.richardchung.doctormeetslawyer`；对方的 `Richy Lite App Store Profile` 仅作结构参考，不可用于本项目。
- GitHub：两专案同账号 `richardchung0907`、共用同一 fine-grained PAT（已内嵌在两仓库 remote，无需改）。

## 对方已验证的上架链路（本项目照搬思路）

1. GitHub Actions（macos runner）构建 IPA + 手动签名（p12 + mobileprovision 从 secrets 还原、临时 keychain、`security import`、`set-key-partition-list`）。
2. `Apple-Actions/upload-testflight-build@v1` 用 ASC API key（ISSUER_ID/KEY_ID/PRIVATE_KEY）上传 TestFlight。
3. 本地 Windows Python 走 App Store Connect REST API（JWT ES256，`pyjwt`，`aud=appstoreconnect-v1`，exp 1200s，**每请求 sleep 1.5s 防限流**）：创建版本 → 声明出口合规（ITSAppUsesNonExemptEncryption=false）→ 关联 build → 更新各语言 whatsNew/reviewNotes → `reviewSubmissions` + `reviewSubmissionItems` + PATCH `submitted=true` 提交审核。**审核结果仍需人工/网页确认，发布方式（自动/手动）在 App Store Connect 的版本 Release Type 里设置。**
4. 截图：本地处理（Pillow，6.5" 1242×2688 / 5.5" 1242×2208）→ API 上传（reservation → 分块 PUT → commit）。

## 当前进度与剩余步骤（2026-08-22 实测后）

1. ✅ **bundle id + provisioning profile**：已完成（见速览）。profile 名除空格外无特殊字符（会嵌入 ExportOptions plist XML），`Doctor Meets Lawyer App Store Profile` 合规。
2. ⏳ **ASC App 记录（唯一必须人工）**：2026 API 禁 `POST /v1/apps`，只能在网页创建：
   - 登录 https://appstoreconnect.apple.com → 我的 App → ＋ → 新建 App。
   - 平台 iOS；名称 `Doctor Meets Lawyer`；主要语言 `英文 (美国)`；Bundle ID 下拉选已注册的 `com.richardchung.doctormeetslawyer`；SKU `doctor-meets-lawyer`；访问权限「完整访问」。
   - 创建后 agent 用 `GET /v1/apps?filter[bundleId]=...` 自动取 app_id，无需用户提供。
3. ⏳ **跑 `setup_appstore.py create` 收尾**（需先改 `create_app()` 为「查已有，无则报错提示网页创建」，避免 403 中断）：版本 1.0.0 → 三语言本地化 → 分类（SOCIAL_NETWORKING/BUSINESS）→ 年龄分级 → 审核详情 → 仅香港。
4. ⏳ **隐私政策 URL 绑定**：`ensure_app_info` 有意留空；create 后用 PATCH `appInfoLocalizations` 补 `privacyPolicyUrl=https://richardchung0907.github.io/doctor-meets-lawyer/privacy-policy.html`（URL 已可访问）。
5. ⏳ **首次构建调试**：推 tag `v1.0.0-ios` 或手动 workflow_dispatch 触发 `build-ios.yml`（macOS 构建 20-50 分钟）。首次大概率要调的点见下方踩坑清单。
6. ⏳ **截图**：Apple 2024 起新 App 需 6.9"/6.5"/5.5" 之一组。素材入 `appScreenshots/raw/` → `process_screenshots.py`（6.5"/1242×2688）→ `upload_screenshots_appstore.py`。TestFlight 上传不要求截图。
7. ⏳ **App 隐私标签**：仅网页可配（API 不支持），提交审核前在 ASC「App 隐私」如实申报（收集：邮箱/用户名/职业/性别/年龄/头像/UGC 话题与聊天/拉黑/推送 token/会员状态；不收集位置/通讯录/照片，无广告追踪）。
8. ⏳ **提交审核**：首次建议 ASC 网页手动提交；之后迭代可用 `submit_version_101.py` 改造成本项目的自动提交脚本。

## 踩坑清单（来自 Filter_APP2 实战 + 本项目适配预判）

### 1. 版本封闭（对方踩过，最重要）
- 已上架的 short version（CFBundleShortVersionString）**不能再提交新 build**：报 Apple `90062`/`90186`（Invalid Pre-Release Train）。要发新版必须升 `app.json` 的 `version`（如 1.0.0 → 1.0.1），build number（CURRENT_PROJECT_VERSION）由 CI 用 `github.run_number` 自动递增即可。
- `version` 在 `package.json` 与 `app.json` 各有一份，prebuild 读 `app.json` 的 version；改版时两处同步。

### 2. Expo prebuild 与 pod 安装
- `npx expo prebuild --platform ios --no-install` 后必须手动 `cd ios && pod install`（macos runner 自带 CocoaPods；首次 pod install 可能 5-15 分钟）。
- prebuild 生成的 workspace/scheme 名由 app 名 sanitize 而来（本项目应为 `DoctorMeetsLawyer.xcworkspace`）；workflow 已用 `find` 动态发现，勿写死。
- `ios/` 目录每次 prebuild 全量重建且被 gitignore——**任何 ios/ 内的手工修改都会丢**，配置一律走 app.json（如权限描述 `ios.infoPlist`）或 CI 步骤。
- app.json 的 `ios.config.usesNonExemptEncryption=false` 会生成 `ITSAppUsesNonExemptEncryption=false`，避免每次上传后的出口合规问卷卡壳。本项目无加密用途，该声明正确。

### 3. Xcode 版本兼容（预案）
- Expo SDK 52 / RN 0.76 的官方支持是 Xcode 15.1–16.x。若 `macos-latest` 已换到更新的 Xcode 导致 pod/xcodebuild 报错，改 pin 旧镜像（如 `macos-15`/`macos-14`）或 `xcode-select` 指定版本。构建报错优先怀疑这一点。
- `CURRENT_PROJECT_VERSION=${{ github.run_number }}` 在 archive 命令行传入，覆盖 prebuild 默认值。

### 4. 签名细节（对方 workflow 已验证可用，勿"优化"掉）
- `security import` 的 `-A`（允许所有应用访问）、`set-key-partition-list -S apple-tool:,apple:,codesign:` 缺一不可，否则 codesign 挂起等交互。
- `KEYCHAIN_PASSWORD` secret 对方复用证书密码——本项目 `setup_github_secrets.py` 同样处理（临时 keychain 密码不必独特）。
- ExportOptions.plist 必须 `method=app-store` + manual + `provisioningProfiles`（bundle id → profile 名）。workflow 里用 `plutil -replace` 注入 profile 名，**profile 名不要含 `&` `<` 等 XML 特殊字符**。

### 5. App Store Connect API 细节
- JWT：`alg=ES256`、`kid=<Key ID>`、`iss=<Issuer ID>`、`aud=appstoreconnect-v1`、`exp=now+1200`；`pyjwt` 直接读 p8 即可。
- **限流**：脚本内置 1.5s/请求延迟；若遇 429，加大延迟。批量操作（10 语言截图上传）跑一次要几分钟，属正常。
- 提交审核用两步法：POST `reviewSubmissions` → 关联 `reviewSubmissionItems` → PATCH `reviewSubmissions/{id}` `{"submitted": true}`。对方脚本有完整样板与失败回退提示（回退 = 网页手动点提交）。
- 截图上传三步：POST `appScreenshotSets/.../appScreenshots` 拿 reservation（含 `uploadOperations`）→ 按 method 分块 PUT 到 S3 → PATCH `uploaded=true` 提交。`upload_screenshots_appstore.py` 已实现，实施时对照对方 `appScreenshots/processed/` 的结构。
- 出口合规：首次上传 build 后 ASC 要求声明；本项目 app.json 已内置 false，若仍被要求声明，用脚本对 build 打 `usesNonExemptEncryption`（参考 `submit_version_101.py`）。

### 6. 仅香港区上架要点（与 EU 无关）
- App Store 无"香港专属"流程：同一 App 记录，可用地区在「定价与销售范围」里只保留香港（territory `HK`）。ASC API 对应 `appAvailability`/`territoryAvailabilities`（实施时查当前 API 版本端点）。
- 香港区只需三语言本地化（en-US、zh-Hans、zh-Hant，本项目 i18n 一致）；对方那套 10 语言（含俄/阿/欧盟多语）与 DSA 交易者声明、Appodeal GDPR/COPPA/ATT 文档**全部不需要**。
- 仍需满足的全局要求：隐私政策 URL、App 隐私标签、年龄分级、截图（Apple 2024 起要求新 App 同时提供 6.9"/6.5"/5.5" 之一组——实施时以 App Store Connect 页面当前要求为准）。
- Expo SDK 52 自带 privacy manifest（`PrivacyInfo.xcprivacy` 由 prebuild 自动合并），无需像 Flutter 那样手写；对方的 `PrivacyInfo.xcprivacy` 是广告 SDK 版（NSPrivacyTracking=true），**不要**照抄。

### 7. Windows 本机跑 Python 的杂项
- 控制台 UTF-8：脚本自带 `io.TextIOWrapper` 兜底；命令行再加 `$env:PYTHONIOENCODING='utf-8'`。
- PowerShell 5.1 引号地狱：复杂内联代码一律写成临时 `.ps1` 文件执行（本 skill 同源经验）。
- `py_compile` 不接受通配符：逐个文件校验或 `python -c "import compileall"`。

### 8. 2026-08-22 实测踩坑（ASC 后台部署，血泪）

- **`POST /v1/apps` → 403 FORBIDDEN_ERROR**：2026 API 的 apps 资源只允许 GET_COLLECTION/GET_INSTANCE/UPDATE，**App 记录必须网页创建**。别浪费时间改参数，直接转网页（阶段 6）。
- **JWT 401 根因：`jwt.encode` 必须显式传 headers（含 kid）**：`jwt.encode(payload, pk, algorithm="ES256", headers={"alg":"ES256","kid":key_id,"typ":"JWT"})`。少传 kid → 苹果 401 NOT_AUTHORIZED。现有脚本都传了，但 read 输出里 token/密码行被 redaction 掩盖，**肉眼读会被误导成没传**。
- **PowerShell 5.1 限制**：不支持 `&&`、不支持 heredoc `<<`（bash 语法）。复杂 Python 一律写临时 .py 文件执行（`scripts/appstore/_debug_*.py`），命令分隔用 `;`。
- **调试脚本路径计算**：脚本在 `scripts/appstore/` 时，`SCRIPT_DIR = dirname(abspath(__file__))`，`PROJECT_DIR = dirname(dirname(SCRIPT_DIR))` 才是项目根。写成 `dirname(dirname(abspath(__file__)))` 只会到 `scripts/`（少一层）。
- **territories 端点**：attributes 无 `code` 字段，id 即地区码（alpha-3）。audit 判断香港用 `t["id"] == "HKG"`，别找 `code`。
- **git push 在 PowerShell 显示"错误"**：git push 进度写 stderr，PowerShell 标红且 exit code 1，但实际成功——看输出末尾 `master -> master`。
- **GitHub Pages 启用**：`POST /pages` 返回 201 后需等 30-60s 构建，首次 GET 可能 404，重试（实测第 2 次即 200）。
- **审核联系电话复用**：旧快照里的版本 id（841b3d9a...）已过期 404。正确路径：`GET /v1/apps/6792005935/appStoreVersions` → 取第一个版本 → `GET /v1/appStoreVersions/{id}/appStoreReviewDetail` → contactPhone=`+852 66744148`（实测对方 App 1.0.2）。
- **`appAvailability` v1→v2 迁移**：`GET /v1/apps/{id}/appAvailability` 已废弃（404/不存在），用 `appAvailabilityV2`；v2 的 availability 没有 PATCH 端点，`availableInNewTerritories` 创建后不可改（见 SOP「仅香港」）。
- **edit 工具精确匹配**：skill 中文字符（全角冒号、引号等）易与肉眼读的不一致导致替换失败——报「Could not find the exact text」时，重新 read 该段、逐字复制再试。
- **网页创建 App 自动生成默认版本「1.0」**：再 POST `1.0.0` 报 409（"You cannot create a new version of the App in the current state"）。`ensure_version` 需 adopt：PATCH versionString 复用该版本；**adopt 路径不会带 copyright，要单独 PATCH**。
- **en-US 本地化 whatsNew 锁定**：网页自动创建的本地化（en-US）在 PREPARE_FOR_SUBMISSION 下 PATCH whatsNew → 409 STATE_ERROR（'whatsNew' cannot be edited at this time）；新建的 zh-Hans/zh-Hant 无此限制。首次发布 whatsNew 留空无碍，别硬刚。
- **availability 必须 POST /v2/appAvailabilities 创建**：新 App 的 `GET /v1/apps/{id}/appAvailabilityV2` 404（资源不存在），不是「自动生成」。POST 请求体需为**全部 175 个地区**建 TA（included 用本地 id `${t0}`...，仅 HKG available=true）；只给单个地区会 409（要求完整集合）。返回 201 后 `availableInNewTerritories=false` 即刻生效。
- **TA id 是 base64url(JSON `{"s":appId,"t":territoryCode}`)**：解码拿地区码，别指望 relationships（`include=territories` 还报 400 非法关系）。
- **v1/v2 前缀混淆**：app 的 availability 关系（`GET /v1/apps/{id}/appAvailabilityV2`）用 v1；availability 的 TA 子资源（`GET /v2/appAvailabilities/{id}/territoryAvailabilities`）必须用 v2 前缀——脚本 BASE 是 /v1 时直接拼 path 会得到 /v1/v2/... 404。api() 加 base 参数解决。
- **ageRatingDeclaration 更新用资源级 PATCH**：`PATCH /v1/ageRatingDeclarations/{id}`（不是 `appInfos/{id}/ageRatingDeclaration`，那会 405 METHOD_NOT_ALLOWED）。
- **ageRatingDeclaration 的「NONE」陷阱（2026-08-22 晚场）**：创建后的 GET 返回 `ageRatingOverrideV2: "NONE"` 与 `koreaAgeRatingOverride: "NONE"`，**不代表已分级**——那是「不使用覆盖」；所有内容字段（medicalOrTreatmentInformation / horrorOrFearThemes / profanityOrCrudeHumor / userGeneratedContent 等 27 个）实测全是 `null`（未设定）。审计脚本若过滤 falsy 值会被误导成「4+ 已设定」——判断标准应为字段值是否 `null`，不是是否等于 `"NONE"`。
- **PATCH 必须带全所有属性（409 ENTITY_ERROR.ATTRIBUTE.REQUIRED）**：只 PATCH 单个字段（如 medicalOrTreatmentInformation）会 409 报 `You must provide a value for the attribute 'horrorOrFearThemes'`——2026 schema 把全部内容字段设为 PATCH 必填，一次性提交所有枚举字段（NONE/INFREQUENT_OR_MILD/FREQUENT_OR_INTENSE）+ 全部布尔字段（true/false）。
- **2026 schema 新增字段**：布尔类 `advertising` / `ageAssurance` / `healthOrWellnessTopics` / `lootBox` / `messagingAndChat` / `parentalControls` / `socialMedia` / `socialMediaAgeRestricted` / `userGeneratedContent`；枚举类新增 `gunsOrOtherWeapons` / `violenceRealistic`（本地 OpenAPI `docs/appstore-connect/openapi/openapi.json` 可查 schema `AgeRatingDeclaration`，`_extract_age_schema2.py` 提取）。
- **本项目申报值（UGC 社交 + 医疗话题，2026-08-22 晚场已 PATCH 并验证）**：`medicalOrTreatmentInformation=INFREQUENT_OR_MILD`（用户指定「医疗或保健」）、`healthOrWellnessTopics=true`、`userGeneratedContent=true`、`messagingAndChat=true`（有私讯）、`socialMedia=true`、`profanityOrCrudeHumor=INFREQUENT_OR_MILD`（仅 blocklist 无自动审核）、其余枚举 NONE / 其余布尔 false；`ageRatingOverrideV2` 与 `koreaAgeRatingOverride` 保持 NONE。`_set_age_rating.py` 可重跑幂等。
- **空值扫描（2026-08-22 晚场 `_null_scan.py`）**：App 级 `contentRightsDeclaration` 与版本级 `usesIdfa` 都是 `null`（网页显示未声明）且 PATCH 可修——`contentRightsDeclaration` 用 `PATCH /v1/apps/{id}` 设 `DOES_NOT_USE_THIRD_PARTY_CONTENT`（UGC 无第三方授权内容），`usesIdfa` 用 `PATCH /v1/appStoreVersions/{id}` 设 `false`（无广告）。其他 NULL/EMPTY 分类见「空值扫描结论」章节，别重复扫描折腾。

## ASC 后台部署 SOP（2026-08-22 实测跑通）

> 目标：让 GitHub Actions 能成功编译并上传 TestFlight 之前，ASC 后台所需的一切配置。
> 核心事实：**bundle id / profile / secrets / 隐私政策均可 API 或脚本完成；App 记录创建 2026 年起只能网页**。

### 阶段 0：侦察（5 分钟）

- 读 `keys.txt`（5 个 ASC key：Issuer ID / Key ID / 证书密码 / profile 名 / p12 base64）、本 skill、`docs/appstore/README`、`docs/appstore-connect/README`、`scripts/appstore/README`。
- 环境：Python 3.12+；`pip install requests pyjwt pynacl pillow`；验证 `python -c "import requests, jwt, nacl, PIL"`。

### 阶段 1：Audit（只读，确认起点）

```powershell
$env:PYTHONIOENCODING='utf-8'; python scripts/appstore/setup_appstore.py audit
```

实测输出要点：分发证书 `9NYCT2Q8LA` 可复用；本项目 bundle id/profile/app 均不存在；分类 `SOCIAL_NETWORKING`/`BUSINESS` 存在；对方 App 当前版本 1.0.2 的审核联系人可复用（见踩坑 8）。

### 阶段 2：create（bundle id + profile 由 API 完成）

```powershell
python scripts/appstore/setup_appstore.py create
```

- ✅ bundle id：`POST /v1/bundleIds`（name/identifier/platform IOS/seedId=TEAM_ID），实测得 id `ABRWS5243T`。
- ✅ profile：`POST /v1/profiles`（profileType `IOS_APP_STORE` + bundleId/certificates 关系），响应 `profileContent` base64 → 存 `ios-signing/doctor_meets_lawyer_app_store.mobileprovision`，实测 id `9K78S6H67G`、ACTIVE。
- ❌ App 记录：`POST /v1/apps` → **403 FORBIDDEN_ERROR（2026 API 禁 CREATE，见踩坑 8）** → 阶段 6 网页创建。

### 阶段 3：同步 keys.txt

`IOS_PROVISIONING_PROFILE_NAME` → `Doctor Meets Lawyer App Store Profile`（与 ExportOptions plist 注入值一致；`setup_github_secrets.py` 读取它）。

### 阶段 4：上传 GitHub secrets（CI 签名必需）

```powershell
python scripts/appstore/setup_github_secrets.py
```

前置：profile 文件已在 `ios-signing/` 下、keys.txt 已更新。实测 8/8 全绿（Android 段无 keystore 自动跳过）：
`IOS_PROVISIONING_PROFILE_NAME` / `IOS_BUILD_CERTIFICATE_BASE64` / `IOS_BUILD_CERTIFICATE_PASSWORD` / `IOS_PROVISIONING_PROFILE_BASE64` / `KEYCHAIN_PASSWORD` / `APPSTORE_ISSUER_ID` / `APPSTORE_KEY_ID` / `APPSTORE_PRIVATE_KEY`。

### 阶段 5：隐私政策 URL（审核必需，现已发布）

1. 写 `docs/privacy-policy.html`（中英双语；如实覆盖数据面：邮箱/密码、用户名/职业/性别/年龄/头像、话题/聊天/拉黑、会员状态、推送 token、最后活跃；不收集位置/通讯录/照片，无广告）。
2. git add/commit/push 到 master（注意 `docs/` 下被 gitignore 的子目录不影响新文件入库）。
3. 启用 Pages：`POST /repos/{owner}/{repo}/pages` body `{"source":{"branch":"master","path":"/docs"}}`（PAT 需 repo 权限，实测 201）。
4. 等 30-60s 构建，GET 验证 200。

### 阶段 6：网页创建 App 记录（唯一人工步骤）—— ✅ 已完成（2026-08-22，App id 6804181628）

- 登录 https://appstoreconnect.apple.com → 我的 App → ＋ → 新建 App：iOS / `Doctor Meets Lawyer` / 英文 (美国) / Bundle ID 下拉选已注册的 `com.richardchung.doctormeetslawyer` / SKU `doctor-meets-lawyer` / 完整访问。
- agent 侧取 id：`GET /v1/apps?filter[bundleId]=com.richardchung.doctormeetslawyer`（无需用户提供任何 ID）。

### 阶段 7：create 收尾（App 记录就位后，实测全绿）—— ✅ 已完成（2026-08-22 后台实测全部落地）

`create_app()` 本身已有「filter[bundleId] 查已有」逻辑，**无需改代码，直接重跑 create**（幂等，跳过已存在的 bundle id/profile，命中 App 记录 exists 分支）。实测完成：

1. **App Store 版本 1.0.0**：⚠️ 网页创建 App 时 Apple **自动生成默认版本「1.0」**，脚本 adopt 逻辑会把它重命名（PATCH versionString）复用；**copyright 需单独 PATCH**（adopt 路径不带上）。
2. 三语言本地化：`POST/PATCH /v1/appStoreVersionLocalizations`（description/keywords/whatsNew/promotionalText）。⚠️ **en-US 是网页自动创建的本地化，PATCH whatsNew 会 409（'whatsNew' cannot be edited at this time）**——脚本已改为 whatsNew 单独 PATCH、失败明确提示；首次发布 whatsNew 留空无碍。
3. 分类：`PATCH /v1/appInfos/{id}` relationships `primaryCategory=SOCIAL_NETWORKING` / `secondaryCategory=BUSINESS`（category id 就是资源 id）。
4. appInfo 本地化：`POST/PATCH /v1/appInfoLocalizations`（name/subtitle；privacyPolicyUrl 有意留空，第 8 步补）。
5. 年龄分级：创建 `POST /v1/appInfos/{id}/ageRatingDeclaration`；**已有时更新用 `PATCH /v1/ageRatingDeclarations/{id}`（资源级路径）**，不是 `appInfos/{id}/ageRatingDeclaration`（405）。
6. 审核详情：`POST /v1/appStoreReviewDetails`（Richard Chung / +852 66744148 / richardchung_0907@hotmail.com，复用对方 App）。
7. 仅香港（见下）。
8. 补隐私 URL：`PATCH /v1/appInfoLocalizations/{id}` `privacyPolicyUrl=https://richardchung0907.github.io/doctor-meets-lawyer/privacy-policy.html`（实测三语言全部 200）。

### 仅香港销售范围（2026 API 实测成功方案）

- 新 App **没有** availability 资源（`GET /v1/apps/{id}/appAvailabilityV2` → 404）——必须先创建：
  **`POST https://api.appstoreconnect.apple.com/v2/appAvailabilities`**（注意是 v2 前缀！BASE 若为 /v1 会拼出 /v1/v2/... 404）。请求体：`data.attributes.availableInNewTerritories=false` + `data.relationships.app` + `data.relationships.territoryAvailabilities.data` 为**全部 175 个地区**的 TA 引用；`included` 里每个 TA 用本地 id（`${t0}`...`${t174}`）+ `relationships.territory.data.id` 指向真实地区码，仅 HKG 的 `available=true`。实测 201 成功。
- **TA id 是 base64url 编码的 `{"s":"<appId>","t":"<territoryCode>"}`**——解码拿地区码：`json.loads(base64.urlsafe_b64decode(id + padding))["t"]`。
- 列 TA：`GET /v2/appAvailabilities/{av_id}/territoryAvailabilities?limit=200`（**v2 前缀**；`include=territories` 非法 400）。
- 禁用单个地区：`PATCH /v1/territoryAvailabilities/{id}`（v1 前缀，body `{"data":{"type":"territoryAvailabilities","id":...,"attributes":{"available":false}}}`）。
- `availableInNewTerritories` 创建后**无法 API 修改**（`PATCH /v2/appAvailabilities/{id}` 不存在），创建时设 false 即可；若未来被网页改动，检查并提示。
- **territory id 是 ISO 3166-1 alpha-3（香港 = `HKG`，不是 `HK`）**；Territory 资源 attributes 无 code 字段，id 即地区码。
- 补缺：`POST /v1/territoryAvailabilities`（relationships appAvailability + territory `HKG`）。

### 阶段 8：验证

- 重跑 audit 或 `GET /v1/apps?filter[bundleId]=...` 确认 App 存在。
- **全量只读审计（推荐）**：`python scripts/appstore/_full_audit.py`（2026-08-22 新增，动态取 id 无硬编码，覆盖 App/版本/本地化/分类/年龄/审核/availability/出口合规/截图/价格/隐私 URL 等 14 项）。
- `scripts/appstore/_verify_signing.py`（签名资产一致性：p12 密码、证书指纹、profile uuid 与后台比对）。
- `scripts/appstore/_extra_checks.py`（价格计划、beta groups、GitHub Actions runs）。
- `verify_appstore_state.py`（需先替换 app_id 硬编码）。
- 浏览器/GET 验证隐私政策 URL 200。

## 成功路径速查（✅ 已完成 / ⏳ 待做，2026-08-22 实测）

```powershell
# 0) 审计当前 ASC 状态（只读，幂等，可随时跑）
$env:PYTHONIOENCODING='utf-8'; python scripts/appstore/setup_appstore.py audit
#    全量审计（推荐）：python scripts/appstore/_full_audit.py

# 1) ✅ 创建 bundle id + profile（App 记录会 403 → 网页创建，见 SOP 阶段 6）
python scripts/appstore/setup_appstore.py create

# 2) ✅ 网页创建 App 记录（id 6804181628）后，API 取 app_id
#    GET https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=com.richardchung.doctormeetslawyer
#    （把得到的 app_id 回填进 scripts/appstore/*.py 的硬编码）

# 3) ✅ secrets 上传（profile 文件就位 + keys.txt 更新后，8/8 全绿）
python scripts/appstore/setup_github_secrets.py

# 4) ⏳ 进行中：secrets 就绪后触发构建（2026-08-24 首跑两次失败，见 doctor-meets-lawyer-ios-build skill）
POST https://api.github.com/repos/richardchung0907/doctor-meets-lawyer/actions/workflows/build-ios.yml/dispatches
Body {"ref":"master"} / Bearer <PAT> / X-GitHub-Api-Version: 2026-03-10
#    build 上传后：出口合规声明关联（PATCH /v1/builds/{id}/relationships/appEncryptionDeclaration）+ 关联版本 1.0.0

# 5) ⏳ 待做：提交审核（改好 app_id/build id/版本号后）
python scripts/appstore/submit_version_101.py
#    ⚠️ submit_version_101.py 仍是对方 App 模板：build id 40bfbf4f（RICHY Build 20）、10 语言、RICHY 审核备注——必须先替换
```

## 当前待办清单（提交审核前，按序）

1. ✅ **已完成（2026-08-24）**：触发 `build-ios.yml` → TestFlight build（run #32743132331 全绿；build `83b9bc34` version 1 `processingState=VALID`；踩坑与解法见 `doctor-meets-lawyer-ios-build` skill：路径重复 / profile 缺 Push capability / iOS 26 SDK frozen enum / macos-15 被 409 拒）。**下一项关联：`PATCH /v1/appStoreVersions/{id}/relationships/build` 把 build 挂到版本 1.0.0**。
2. 出口合规：创建豁免声明并关联 build（app.json 已设 usesNonExemptEncryption=false）→ PATCH 关联版本 1.0.0。
3. 价格计划：`POST /v1/appPriceSchedules`（Free）或网页设置「定价与可用性」。
4. 截图：三语言 iOS 版正式截图上传（`upload_screenshots_appstore.py`，先确认素材与尺寸）。
5. 网页确认：App 图标、App 隐私标签（App Privacy）、Paid Apps Agreement（银行/税务）；内容权利声明已 API 修复，不再需要网页。
6. 适配 `submit_version_101.py`（build id、3 语言、审核备注）后提交审核。

## 空值扫描结论（2026-08-22 晚场，`_null_scan.py` 全资源扫描）

> 扫描 17 组资源（App/版本/本地化/AppInfo/年龄分级/availability/定价/build/出口合规/beta/IAP/EULA 等），
> 39 NULL + 15 EMPTY 逐一判定。**判断标准：字段值为 `null` ≠ 显式 `"NONE"`**（曾因过滤 falsy 误判年龄分级为 4+）。
> 重跑：`python scripts/appstore/_null_scan.py`（只读）。

### 已修复（HTTP 200 + 复验）

- `App.contentRightsDeclaration`：None → `DOES_NOT_USE_THIRD_PARTY_CONTENT`（UGC 平台、无第三方授权内容；`PATCH /v1/apps/{id}`，`_fix_nulls.py` 幂等）。
- `Version.usesIdfa`：None → `false`（无广告、无 ATT、不采集 IDFA；`PATCH /v1/appStoreVersions/{id}`）。

### 阻塞待办（见「当前待办清单」）

- `Builds = []` + `Version.build.attached = None`；三语言 `screenshotSets = []`；
  `PriceSchedule.manualPrices/automaticPrices = []`；`appEncryptionDeclarations = []`。

### 建议处理（不阻塞，审核友好 / 上线前）

- `App.accessibilityUrl`：建议放无障碍支持页 URL。
- `marketingUrl` / `supportUrl`（三语言）：建议至少补 supportUrl。
- `inAppPurchasesV2 = []` + `EULA = None` + Paid Apps Agreement 未签：**若首版开放付费墙则硬缺口**，否则可暂缓（IAP skill 已记录上线前待办）。
- `App.subscriptionStatusUrl*`：用 RevenueCat 可留空，正常。

### 正常空（别再当遗漏折腾）

- `en-US.whatsNew`（409 锁定）、`earliestReleaseDate`（releaseType=AFTER_APPROVAL）、
  `ReviewDetail.demoAccount*`（demoRequired=false）、`AppInfo.*.privacyChoicesUrl/privacyPolicyText`（可选）、
  `AppInfo.australia/france/koreaAgeRating`（地区覆盖可选）、`AgeRating.kidsAgeBand`（非儿童 App）、
  `AgeRating.developerAgeRatingInfoUrl`（可选）、`BetaReview.*` / `BetaLicenseAgreement` / `BetaGroups`（无 build 前空）、
  `PreReleaseVersions` / `AppCustomProductPages` / `AppEvents` / `AppClips` / `Experiments`（可选功能）、
  `ReviewSubmissions = []`（尚未提交）。

### 网页项（API 不可查）

App 图标 1024×1024（**官方 API 无上传端点**，见下章）、App 隐私标签（App Privacy）、Paid Apps Agreement（银行/税务信息）。

## App 图标（App Icon）：官方 API 不支持上传（2026-08-22 调查结论）

> 背景：曾认为 Filter_APP2「用 API 自动上传 app icon 到 ASC」，经调查证伪。
> **结论：App Store Connect API（含 2026 版）没有任何 App 图标上传端点，商店图标的最终选用只能网页操作。**
> 别浪费时间找 API 捷径；若 Apple 未来新增端点，`turnMD_asc.py` 重跑同步文档即可。

### 证据链

1. 本地 OpenAPI（`docs/appstore-connect/openapi/openapi.json`）全路径扫描：icon 相关只有 `GET /v1/builds/{id}/icons` 与 `GET /v1/builds/{id}/relationships/icons`（只读 build 内嵌图标）；可上传图片资产只有截图/预览/审核附件/App Clip 图/Game Center 图/IAP 图/订阅图——**无 App 图标**。
2. 官方概念文档 `concepts/uploading-assets.md` 的资产类型表不含 App 图标。
3. Apple 帮助页「Add an app icon」：图标在 Xcode 配置、随 build 上传（"After adding icons in Xcode, upload the build to App Store Connect"）。
4. Apple Developer Forums 多个帖子确认「API 无法获取/上传 app icon」（"there seems to be no way"）。
5. Filter_APP2 代码库：git log 的 icon commit 只是 flutter_launcher_icons 生成原生资源；无任何 icon 上传脚本、无 fastlane、无浏览器自动化。

### 真相：图标随 build 走，不是单独上传

Filter_APP2 实际链路（后台 `GET /v1/builds/{id}/icons` 实测佐证，iconType=APP_STORE、templateUrl 指向 mzstatic）：

```
pubspec.yaml flutter_launcher_icons (image_path: assets/images/app_icon.png)
  → 生成 ios/Runner/Assets.xcassets/AppIcon.appiconset（含 1024×1024）
  → CI 构建 IPA（Asset Catalog 打进二进制）
  → Apple-Actions/upload-testflight-build@v1 上传 IPA（整个包，非单独图标）
  → ASC 从 build 提取 AppIcon（buildIcons 资源，API 可查）
  → 「App 信息 → App 图标」最终选用 = 网页操作（无 API）
```

### 对本项目（Expo）的意义

- `app.json` 已配 `icon: ./assets/icon.png` → prebuild 生成 Asset Catalog → CI 构建打进 IPA → **build 自带图标**（build 上传后可用 `GET /v1/builds/{id}/icons` 验证）。
- ASC 后台「App 信息 → App 图标」1024×1024 商店图标只能网页上传/选择——已列入「当前待办清单」第 5 条。
- 调查脚本留存：`_inspect_app2_icons.py`（查任意 app 的 build icons）、`_dump_icon_schema.py`（BuildIcon schema）。

## 安全红线

- `keys.txt`、`ios-signing/`、`docs/appstore/` 永不入库（.gitignore 已覆盖；证书通配 `*.p8/*.p12/*.mobileprovision/*.cer` 双保险）。
- p8 私钥与证书密码不得出现在任何 commit、日志、截图或聊天输出中。
- 证书 2027-07-17 到期：到期前需在 Apple Developer 换新证书并重新生成 profile（流程同首次）。

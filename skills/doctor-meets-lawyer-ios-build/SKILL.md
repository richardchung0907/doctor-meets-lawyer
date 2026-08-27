---
name: doctor-meets-lawyer-ios-build
description: 本项目用 GitHub Actions 编译 iOS IPA 并自动上传 TestFlight 的触发链路与踩坑手册（2026-08-24 全链路打通，2026-08-25 二次构建成功，2026-08-27 早晚场四次构建成功）。涵盖：非交互触发（keys.txt fine-grained PAT / workflow_dispatch / tag v*-ios）、build-ios.yml 全链路踩坑与成功解法（archive 的 ios/ios 路径重复、profile 缺 Push Notifications capability、Xcode 26 Swift6 / iOS 26 SDK frozen enum 编译 error、macos-15 构建被 ASC 409 拒、perl 替换不可靠、**TestFlight bundle version 冲突 -19232**）、job 日志下载排障（302 → Azure 签名 URL，gzip/BOM 兼容）、TestFlight 分发配置现状（新 build 关联 Internal Testers 组 SOP）、**APNs 推送凭证配置（eas-cli GraphQL 非交互上传 push key；pg_net 日志排障 / InvalidCredentials）**。接手「把 iOS app 编译推到 TestFlight 供测试」任务先读此 skill + doctor-meets-lawyer-ios-release（ASC 上架侧）。
invocation: model+user
---

# Doctor Meets Lawyer — iOS 构建（GitHub Actions）触发与排障手册

## When to use

需要把最新 App 代码编译成 iOS IPA 并推到 TestFlight 供用户测试（或排查 `build-ios.yml` 构建失败）时，**先读本节**。App Store 上架/ASC 后台配置见 `doctor-meets-lawyer-ios-release`；Android 侧对称手册见 `doctor-meets-lawyer-android-build`。

## 30 秒速览（现状 2026-08-27 早晚场四次构建成功 ✅）

- **✅ 已打通（2026-08-24）**：run `#32743132331`（dispatch，14 分钟）17 步骤全绿，IPA 已上传 TestFlight，ASC build id `83b9bc34-b911-43d6-b9cd-411ca50e1f8b`（version 1，`processingState=VALID`，`usesNonExemptEncryption=False`）。
- **✅ 二次构建（2026-08-25）**：run `#32801673563`（dispatch，12 分钟）全绿，ASC build `5c3c24ce-12b7-4275-ae79-90a50c642920`（version **2**，VALID），**已关联 Internal Testers 组**（详见文末）。途中踩了 bundle version 冲突坑（坑 8）——同 version 每次上传必须递增 `ios.buildNumber`。
- **✅ 三次构建（2026-08-27 早场）**：run `#33039619292`（dispatch，成功）job 全绿，ASC build `d18bd2c8-8882-412a-bacc-8528b96ceb47`（version **3**，VALID），**已关联 Internal Testers 组**。与 Android 同 HEAD 并行构建，run 定位用按 `path` 过滤（见 android-build skill 坑 10）。
- **✅ 四次构建（2026-08-27 晚场）**：run `#33055704629`（dispatch，约 6 分钟）job 全绿，ASC build `ee42be04-f2bf-45bc-ac6b-f2ce2e2f1be4`（version **4**，VALID），**已关联 Internal Testers 组**（组内现有 v1/v2/v3/v4 四个 build）。流程：先 commit（`app.json` `ios.buildNumber` 3→4）→ push master 触发 Android → 紧接着 dispatch iOS，与 Android 并行构建一次搞定。
- CI：`.github/workflows/build-ios.yml`（name: `Build iOS App`）。触发 = **push tag `v*-ios`** + **`workflow_dispatch`**。链路：`npm install` → `expo prebuild` → `pod install` → **强制 Pods Swift 5 + patch expo-localization** → 签名 → `xcodebuild archive`（`SWIFT_VERSION=5.0`）→ `export IPA` → `upload-artifact`（`ios-ipa-release`）→ `Apple-Actions/upload-testflight-build@v1` 上传。
- **现成脚本**：
  - `python scripts/gh_build_ios.py` —— 非交互触发 + 轮询（push master → dispatch/打 tag → 轮询 → 报告 job 与失败步骤；`--run-id` 接续轮询，`--interval 120` = 每 2 分钟）。
  - `python scripts/appstore/_debug_ios_logs.py <run_id> [--tail N|--errors]` —— 下载 job 日志定位失败根因。
  - `python scripts/appstore/_fix_push_capability.py` —— 修复 profile 缺 Push capability（bundle id 加 capability + 删旧 profile 重建 + 验证 entitlements）。
  - `python scripts/appstore/_query_builds.py` / `_query_beta.py` —— 只读查 ASC build / beta 组。
- **遗留（TestFlight 分发）**：~~build 已 VALID 但 betaGroups 为空~~ **已解决（2026-08-24）**：Internal Testers 组已建、tester 已入组；**每次新 build 上传后需手动关联到组**（SOP 见文末，build 5c3c24ce v2、d18bd2c8 v3、ee42be04 v4 均已关联）。

## 技术栈（本次实测）

- Expo SDK 52 / RN 0.76（`react-native 0.76.7`、`hermes-engine 0.76.7`）；`expo-notifications ~0.29.14`（推送硬需求，曾引发签名坑）。
- runner：**必须 `macos-latest`（Xcode 26.6，iOS 26 SDK）**——ASC 2026 起拒绝 iOS 26 SDK 以下的上传（详见坑 5）。
- 上传：`Apple-Actions/upload-testflight-build@v1`（ASC API，issuer/key id/p8）。
- GitHub REST：版本头 **`X-GitHub-Api-Version: 2026-03-10`**。
- ASC：`requests` + `pyjwt`（ES256，`make_token`/`api` 在 `scripts/appstore/setup_appstore.py`，可复用）。

## SOP（全链路实测成功，非交互）

```powershell
# 1) 触发（dispatch；tag 推送同样有效）
$token = [regex]::Match((Get-Content keys.txt -Raw), 'github_pat_[A-Za-z0-9_]+').Value
$h = @{ Authorization = "Bearer $token"; 'X-GitHub-Api-Version' = '2026-03-10'; 'User-Agent' = 'x' }
Invoke-WebRequest -Uri '.../actions/workflows/build-ios.yml/dispatches' -Method POST -Headers $h -Body '{"ref":"master"}' -UseBasicParsing  # 200 = 接受

# 2) 定位 run（GET .../actions/runs?branch=master&event=workflow_dispatch&per_page=3）
# 3) 每 2 分钟轮询
$env:PYTHONIOENCODING='utf-8'; python scripts/gh_build_ios.py --run-id <RUN_ID> --interval 120 --timeout 90
# 4) 失败排障
python scripts/appstore/_debug_ios_logs.py <RUN_ID> --errors
# 5) 成功验证：ASC build 状态
python scripts/appstore/_query_builds.py
# 6) 把新 build 关联到 Internal Testers 组（新 build 上传后必须做，否则 tester 看不到）
#    POST /v1/builds/{build_id}/relationships/betaGroups  body {"data":[{"type":"betaGroups","id":"75580122-d316-4fe7-b0ed-e7260df916b5"}]}  → 204
```

- **dispatch 返回 200 + `{"workflow_run_id":...}`（2026 API，不再只是 204；Android skill 里「只把 204 当成功」已过时）**——用返回的 `workflow_run_id` 直接接 `gh_build_ios.py --run-id`，**不要**再用 GET runs 列表按名字/时间猜 run（同名 workflow 的历史 run 会干扰定位，2026-08-25 实测）。
- 全自动模式 `python scripts/gh_build_ios.py` 默认打 tag `v1.0.0-ios` + push 触发；**tag 一旦推送不能覆盖**（GitHub 禁非 force 覆盖同名 tag），改动 workflow 后建议 dispatch 模式 + `--run-id`。
- 构建时长实测 12–14 分钟（macos-latest，Xcode 26.6）。

## 踩坑清单（2026-08-24 全链路实录，按序）

### 坑 1（✅ 已修）：archive/export 步骤 `cd ios` 路径重复
- 现象：run 1 分钟内失败 `xcodebuild: error: 'ios/DoctorMeetsLawyer.xcworkspace' does not exist`（exit 66）。
- 根因：discover 输出相对根的 `ios/DoctorMeetsLawyer.xcworkspace`，archive 又 `cd ios` → `ios/ios/...`。
- 解法：archive/export **去掉 `cd ios`**（commit `1f5e891`）。

### 坑 2（✅ 已修）：Provisioning profile 缺 Push Notifications capability
- 现象：run 2 分钟失败 exit 65：`Provisioning profile "***" doesn't include the Push Notifications capability / aps-environment entitlement`。
- 根因：`expo-notifications` 使 prebuild entitlements 含 `aps-environment`，但 bundle id `ABRWS5243T` 无 Push service（原只有 `IN_APP_PURCHASE`），旧 profile `9K78S6H67G` 因此 INVALID。
- 解法（`python scripts/appstore/_fix_push_capability.py`，一次成功）：
  1. `POST /v1/bundleIdCapabilities`，`attributes.capabilityType=PUSH_NOTIFICATIONS`，`relationships.bundleId.data.id=ABRWS5243T`（端点/schema 已在本地 OpenAPI 确认）。
  2. `DELETE /v1/profiles/9K78S6H67G` → `POST /v1/profiles` 重建同名 `Doctor Meets Lawyer App Store Profile`（新 id `5J83S8N5AH`，ACTIVE）。
  3. `profileContent` base64 写回 `ios-signing/doctor_meets_lawyer_app_store.mobileprovision`（12333 字节）。
  4. 本地解析 entitlements 验证 `aps-environment: "production"` 已包含（plistlib 提取 `<plist>...</plist>`）。
  5. `python scripts/appstore/setup_github_secrets.py` 重传 secrets（**`IOS_PROVISIONING_PROFILE_BASE64` 必须换新**；NAME 沿用同名无需动）。8/8 全绿。

### 坑 2b（2026-08-27 解决）：iOS 推送通知链接不上——Expo 项目缺 APNs 凭证
- **现象**：app 前台能收到通知（Realtime 本地通知），后台/锁屏无系统通知。pg_net 日志（`net._http_response.content`）显示 Expo Push 返回 `InvalidCredentials`：`"Could not find APNs credentials for com.richardchung.doctormeetslawyer"`。
- **根因**：Expo 项目需要 APNs Auth Key 才能向 iOS 发远程推送。`AuthKey_LSLS88W574.p8` 是 **App Store Connect API Key**（用于 TestFlight 上传），**不是** APNs 推送密钥；`distribution.pem/.cer` 是 Apple Distribution 签名证书，也不是推送凭证。
- **解法（APNs Auth Key 创建 + 非交互上传到 Expo）**：
  1. Apple Developer 后台（Certificates, Identifiers & Profiles -> Keys -> `+`）新建启用 Push Notifications 的 Key，下载 `.p8`，记下 Key ID。
  2. `eas credentials --platform ios` 是纯交互命令，非交互环境不可用（源码报错 "A new push key cannot be created in non-interactive mode"）。**非交互上传方式**：通过 eas-cli 内部模块直接调 EAS GraphQL API（`https://api.expo.dev/graphql`，认证头 `expo-session: <~/.expo/state.json 的 auth.sessionSecret>`）：
     - `createPushKeyAsync`（`eas-cli/build/credentials/ios/api/GraphqlClient.js`）：输入 `{ apnsKeyP8, apnsKeyId, teamId, teamName }`，返回 pushKey（含 id + appleTeam）
     - `createOrGetIosAppCredentialsWithCommonFieldsAsync`：输入 `appLookupParams = { account, projectName, bundleIdentifier }`，返回 iosAppCredentials
     - `updateIosAppCredentialsAsync({ applePushKeyId })`：绑定 push key 到 app
  3. 验证：直连 `https://exp.host/--/api/v2/push/send` 给真实 push token 发测试推送，返回 `{"data":{"status":"ok"}}`（不再 InvalidCredentials）。
- **验证推送结果**（生产库 SQL）：`SELECT id, status_code, LEFT(content, 220) AS content_preview FROM net._http_response ORDER BY id DESC LIMIT 10;`
- **注意**：Provisioning profile 必须含 `aps-environment`（坑 2 已修）。APNs Auth Key 是 **账号级凭据**（同一 Apple Team 下所有 app 通用），上传一次即可用于多个项目。
### 坑 3（✅ 已绕过）：job 日志下载 302 + gzip/BOM 混合
- `GET /actions/jobs/{id}/logs` → **302 → Azure 签名 URL**（无需认证、1 分钟有效）；必须禁跟随重定向手动取 Location（urllib 自动跟随会 401）。
- 内容可能是 **gzip 或带 UTF-8 BOM 的纯文本**——解析先试 `gzip.decompress`，失败剥 BOM 当文本（`_debug_ios_logs.py` 已封装）。
- PowerShell 的 `Invoke-WebRequest .Content` 是字符串，写二进制会混 BOM 损坏——下载一律 Python urllib。

### 坑 4（✅ 已修）：Xcode 26 / Swift 6 —— `switch must be exhaustive`（真相不是语言模式）
- 现象：macos-latest 上编译 12 分钟后 error：`node_modules/expo-localization/ios/LocalizationModule.swift:93:5: error: switch must be exhaustive`（exit 65）。
- **排除过程**：① 命令行 `SWIFT_VERSION=5.0` 无效；② 强制改 `Pods.xcodeproj` 里所有 SWIFT_VERSION（本来就是 5.0/5.4）无效。
- **真相**：iOS 26 SDK 的 Foundation 把 `Calendar.Identifier` 视为 **frozen enum**，expo 的 `switch calendar.identifier` 缺 `@unknown default` 直接 error（与 Swift 语言模式无关；macos-15 的 iOS 18.5 SDK 下 non-frozen 只 warning）。
- 解法（workflow 步骤 `Patch expo-localization for iOS 26 SDK`）：`python3` heredoc 在 `case .iso8601:` 后插入：
  ```swift
  @unknown default:
    return ""
  ```
  用**正则**匹配 `case \.iso8601:\n(\s+)return "iso8601"\n`（兼容任意缩进），本地先用 `_verify_localization_patch.py` 验证过。

### 坑 5（✅ 已修）：macos-15 编译的 build 被 ASC 409 拒（SDK version issue）
- 现象：macos-15（Xcode 16.x，iOS 18.5 SDK）编译/导出/artifact 全成功，但 `Apple-Actions/upload-testflight-build@v1` 报：
  `Validation failed (409) SDK version issue. This app was built with the iOS 18.5 SDK. All iOS and iPadOS apps must be built with the iOS 26 SDK or later...`
- 结论：**上传必须 Xcode 26（macos-latest）**；旧镜像能编译但传不上去。于是走「macos-latest + Swift 5 相关 patch（坑 4）+ archive 加 `SWIFT_VERSION=5.0`（双保险）」。

### 坑 6（✅ 已绕过）：workflow 里 perl 替换不可靠
- 现象：perl `-0pi -e 's/.../'` 无报错但替换未生效，`grep` 找不到 → 步骤 exit 1（run `#32742506702`）。
- 解法：改用 **`python3 - <<'PY'` heredoc** 做文件改写（逻辑先在本地 `_verify_localization_patch.py` 验证），并打印 `[OK]`/`[SKIP]` 便于排查。

### 坑 7（⚠️ 观察中）：Node 20 deprecation 等警告
- `actions/checkout@v4`、`actions/setup-node@v4` 被强制跑 Node 24（warning）；Pods 里 deployment target 9.0/12.0、Hermes script phase 无 outputs（warning）；RevenueCat 的 `switch must be exhaustive`（**warning**，非 error）。均不阻塞，勿当错误。

### 坑 8（✅ 已修）：TestFlight 上传被拒 `-19232 bundle version 必须递增`
- 现象（2026-08-25 run `#32800911386`）：编译/签名/导出/artifact **全部成功**（12 分钟），仅 `Upload to TestFlight` 步失败：`The provided entity includes an attribute with a value that has already been used (-19232) The bundle version must be higher than the previously uploaded version: '1'.`（`altool` ExitFailure 31）。
- **根因**：Expo prebuild 把 `ios.buildNumber`（**默认 `'1'`**，见 `node_modules/@expo/config-plugins/build/ios/Version.js` 的 `getBuildNumber`）**字面写入** Info.plist 的 `CFBundleVersion`；workflow archive 命令里的 `CURRENT_PROJECT_VERSION=${{ github.run_number }}` **从未生效**（Info.plist 是字面值，不是 `$(CURRENT_PROJECT_VERSION)` 引用）。第一次上传（v1）成功只因无历史版本；第二次同值上传必撞。
- **解法**：`app.json` 显式递增 `ios.buildNumber`（1→2，commit `5fcc8fe`）→ commit + push → 重新 dispatch。
- **规则**：**同 `expo.version` 下每次新 TestFlight build 都要递增 `ios.buildNumber`**（已用过 1、2、3、**4**（2026-08-27 晚场 v4），下次用 **5**；升级 `version` 后可重置）。改 `app.json` 后 push master 会**额外触发一次 Android 构建**（build-android.yml 监听 push master），产物内容不变，忽略即可——若本来就要发 Android，则正好一次 push 同时满足两侧。

### 坑 9（✅ 已绕过）：旧 tag 不能触发新构建（复用会构建旧代码）
- 现象：`v1.0.0-ios` tag 已存在并指向**旧 commit**；`gh_build_ios.py` 的 tag 模式（`step_push_and_tag`）发现本地/远程已有同名 tag 会**复用**，push tag 触发的 build-ios.yml 构建的是**旧代码**（或远程已有同名 tag 时直接跳过不触发）。
- 解法：新构建一律 **`workflow_dispatch`**（构建 master 最新 HEAD），不要依赖旧 tag；如需 tag 触发就起**新名字**（如 v1.0.1-ios）。2026-08-25 实测：旧 tag 场景下 dispatch 是最稳路径。

## 验证清单（2026-08-24 / 2026-08-25 / 2026-08-27 早晚场共四次全绿）

- dispatch 200（返回 `workflow_run_id`）；run `conclusion == success`；17 步骤全绿（含 **Upload to TestFlight**）。
- ASC：`GET /v1/builds?filter[app]=6804181628` → build `83b9bc34...`（v1）+ `5c3c24ce...`（v2）+ `d18bd2c8...`（v3）+ `ee42be04...`（v4）均 `processingState=VALID`，`usesNonExemptEncryption=False`。
- artifact `ios-ipa-release` 可下载。
- **新 build 已关联 Internal Testers 组**（`GET /v1/betaGroups/75580122-d316-4fe7-b0ed-e7260df916b5/builds` 可查），tester `richardchung_0907@hotmail.com` 状态 `INSTALLED`。

## TestFlight 分发（✅ 2026-08-24 配置 Internal Testing；2026-08-25 新 build 关联完成）

- **组**：`Internal Testers`（id `75580122-d316-4fe7-b0ed-e7260df916b5`，`isInternalGroup=true`）；已关联 build `83b9bc34`（v1）、`5c3c24ce`（v2）、`d18bd2c8`（v3）、`ee42be04`（v4）；tester `richardchung_0907@hotmail.com`（Richard Chung，id `131764c4-f957-490e-b4e8-2b4f1cfaf27d`）在组内，状态 `INSTALLED`（TestFlight 会自动向已装用户推送新 build 更新）。

### 新 build 关联组 SOP（每次上传后必做）

1. 查新 build id：`python scripts/appstore/_query_builds.py`（按 `version` 认最新；上传后 `processingState` 从 PROCESSING → VALID，通常几分钟内）。
   - **2026-08-27 实测：上传后 builds 列表会延迟出现**——job 全绿（含 Upload 步骤）后第一次跑 `_query_builds.py` 只看到旧 v1/v2，**约 2-3 分钟后 v3 才出现**（`uploadedDate` 落在上传时刻）。别误判失败，等几分钟重查即可。
2. 关联：`POST /v1/builds/{build_id}/relationships/betaGroups`，body `{"data":[{"type":"betaGroups","id":"75580122-d316-4fe7-b0ed-e7260df916b5"}]}`，**返回 204 = 成功**。**2026-08-27 实测可复用 `setup_appstore.py` 的 `api()`**：
   ```python
   from setup_appstore import api
   api("POST", f"builds/{build_id}/relationships/betaGroups",
       json_data={"data": [{"type": "betaGroups", "id": "75580122-d316-4fe7-b0ed-e7260df916b5"}]},
       expect=(204, 200))   # expect 只放 204/200，避免默认含 409 静默吞掉、打印真实状态码
   ```
   **注意 `make_token()` 无参数**：直接 `api()` 内部自动调用，**不要** `make_token(keys)` 自己传参（会 `TypeError: make_token() takes 0 positional arguments but 1 was given`）。
   **注意 `api()` 返回值是 `requests.Response` 对象**（不是 `(code, data)` 元组）：用 `r.status_code` / `r.json()` 取结果；状态码不在 `expect` 里会 raise `RuntimeError`。2026-08-27 晚场实测 v4 关联 204 成功（脚本写 `code, data = api(...)` 会 `ValueError: not enough values to unpack`）。
3. 验证：`GET /v1/betaGroups/{id}/builds`（组侧端点，能看到关联的新旧 build）。
4. ASC API 偶发读超时（`requests` timeout=60 抛 `ReadTimeout`，429/5xx 之外不重试）——遇到重跑一次即可。

### 踩坑（Internal Testing 配置）

1. **POST betaTesters 2026 API 必须带 relationships**：`POST /v1/betaTesters` 不带 `relationships.betaGroups`（或 builds）会 409 `ENTITY_ERROR`（"Either betaGroups or builds relationship is required"）。正确：创建时直接带 `relationships.betaGroups.data=[{type,id}]`，一次完成创建+关联。
2. **409 `Tester(s) cannot be assigned`**：该邮箱曾作为对方 App（RICHY，app `6792005935`）的 tester（旧 id `6fd7543d`，在对方 Internal 组 `Ka chai internal`）存在，跨 app 共享的 tester 记录无法再分配到新 Internal 组——**DELETE 旧 betaTester 后重建即可**（删除不影响对方 app 的 build/组结构，只移除 tester 引用）。
3. **`setup_appstore.py` 的 `api()` expect 含 409**：会静默吞掉 409 当作成功（脚本没报错但操作实际失败）。**涉及 betaTester/betaGroup 的调用务必打印真实状态码**，或用 `requests` 直接调。
4. 验证用组侧端点：`GET /v1/betaGroups/{id}/betaTesters`、`GET /v1/betaGroups/{id}/builds`（`builds/{id}/relationships/betaGroups` 只允许 CREATE/DELETE，GET 403）。

## 关联

- `doctor-meets-lawyer-ios-release`：ASC 上架、待办（出口合规声明关联 build、价格计划、截图、submit_version_101.py 适配——build 已就位，`Version.build.attached` 待关联）。
- `doctor-meets-lawyer-android-build`：同源 dispatch/artifact/302/UTF-8 踩坑。
- `doctor-meets-lawyer-env`：本机开发环境。

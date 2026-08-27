---
name: doctor-meets-lawyer-android-build
description: 本项目用 GitHub Actions 编译 Android APK 的踩坑记录与成功解法。涉及：非交互触发 workflow_dispatch、fine-grained PAT（keys.txt / remote 内嵌 token）、2026 年 GitHub artifact 下载 API 变更（版本头 2026-03-10 + /zip 302 → 签名 URL）、Python urllib 302 处理、Windows Python UTF-8 输出、PowerShell 引号转义、产物与 mount_emulator.py 兼容。接手本项目的 agent 编译 APK 前先读此 skill。
invocation: model+user
---

# Doctor Meets Lawyer — Android 编译（GitHub Actions）踩坑手册

## When to use

需要把最新 App 代码编译成 Android 可安装 APK（实机/模拟器测试）、修改或重跑 CI 构建、下载构建产物时，**必读本节**。

## 30 秒速览（现状）

- CI：`.github/workflows/build-android.yml`（name: `Build Android APK`），触发方式 = `push`（main/master）+ `workflow_dispatch`；产物 artifact 名 **`app-release-apk`**。
- 构建步骤：`npm install --legacy-peer-deps` → `npx expo prebuild --platform android` → `cd android && ./gradlew assembleRelease --no-daemon` → `upload-artifact`（`android/**/*.apk`）。**完整构建约 10 分钟**。
- **现成脚本（已可用）**：`python scripts/gh_build_download.py`——自动 commit+push 最新修改 → dispatch → 每 2 分钟轮询 → 下载 APK 到 `build_downloads/app/`。别重复造轮子。
- 产物落点：`build_downloads/app/app-release.apk`（约 62 MB）；`scripts/mount_emulator.py` 递归扫 `build_downloads/**/*.apk` 按**修改时间最新**安装，放子目录即可被识别。

## 踩坑清单（按主题）

### 1. 触发构建（务必非交互，避免卡死）
- 交互式 `gh workflow run` 可能弹浏览器/登录，agent 环境会卡住。**一律走 REST API**：
  ```powershell
  POST https://api.github.com/repos/richardchung0907/doctor-meets-lawyer/actions/workflows/build-android.yml/dispatches
  Body: {"ref":"master"}
  Headers: Authorization: Bearer <PAT> / Accept: application/vnd.github+json / X-GitHub-Api-Version: 2026-03-10
  ```
  返回 **204 或 200** 即接受（2026-08-18 实测新版 API 返回 `200` + body `{"workflow_run_id":...,"run_url":...,"html_url":...}`，不再是文档里的 204；两者都算成功）。`push` 到 master 也会触发同一 workflow，dispatch 是双重保险（工作区干净时 dispatch 仍强制构建 HEAD）——**`gh_build_download.py` 目前只把 204 当成功、其余当 WARN**，看到 WARN 别急着判失败，去确认 run 是否已创建（200 的 body 里就有 `run_url`）。
- PAT 权限：`GET .../actions/workflows/build-android.yml` 返回 200 = 有 `actions:read`；dispatch 需要 **Actions write**（本项目的 fine-grained PAT 已验证可用）。

### 2. 密钥与 push 的非交互
- PAT 在 `keys.txt`（`Github key:github_pat_...`，fine-grained）。读取用正则 `github_pat_[A-Za-z0-9_]+`。
- **git remote 的 URL 已内嵌 token**（`https://github_pat_...@github.com/richardchung0907/doctor-meets-lawyer.git`）——直接 `git push origin HEAD:master` 即非交互，不要重新配 credential。
- 工作区修改（含 metro 热重载保存的文件）由脚本 `git add -A` 自动提交推送；`.gitignore` 已保护 `scripts/sim/`、`build_downloads/`、`scripts/*.py` 等本机内容，不会被误提交。

### 3. artifact 下载 —— 2026 年 GitHub API 变更（最易踩的坑）
- **旧 API 版本头 `X-GitHub-Api-Version: 2022-11-28` 下：`/zip` 返回 401、`/archive` 返回 404 —— 全废**。
- **正确姿势（已验证）**：版本头必须用 **`X-GitHub-Api-Version: 2026-03-10`**，端点仍是：
  `GET https://api.github.com/repos/{owner}/{repo}/actions/artifacts/{artifact_id}/zip`
  响应是 **302**，`Location` 指向 Azure Blob **签名下载 URL**（约 1 分钟有效、无需认证）。先 `GET .../runs/{run_id}/artifacts` 拿 artifact id（按 `name == "app-release-apk"` 过滤）。
- artifact 过期：默认保留期 90 天，过期后 404，需要重新构建。

### 4. Python urllib 的 302 陷阱
- 用 `urllib.request.build_opener(NoRedirect)` 禁跟随重定向后，302 不会作为响应返回，而是抛 **`urllib.error.HTTPError`，`e.code == 302`**——必须 `except HTTPError` 分支读 `e.headers.get('Location')`，再直接 GET 签名 URL（不带 Authorization）。
- 反例：让 urllib 自动跟随跨域 302 时 header 处理不可控；`/archive` 端点不存在。

### 5. Windows Python 中文输出
- 控制台默认 cp1252，`print` 中文直接 `UnicodeEncodeError`。脚本头部必须：
  ```python
  if hasattr(sys.stdout, 'reconfigure'):
      sys.stdout.reconfigure(encoding='utf-8', errors='replace')
      sys.stderr.reconfigure(encoding='utf-8', errors='replace')
  ```
- 跑命令时再加 `$env:PYTHONIOENCODING='utf-8'` 双保险。

### 6. PowerShell 5.1 引号转义地狱（写/调脚本时）
- **反引号才是 PS 转义符**，`\$` 在双引号里不是转义（会把字面 `\$` 传给 node/python）。
- 单引号字符串传给原生程序时，内部双引号会被 PS 5.1 剥离破坏（`node -e "...'{\"a\":1}'..."` 会炸）。
- **结论：复杂内联 JS/Python/JSON 一律用 write 工具写临时文件再执行，不要用 `node -e` / 大段内联**。

### 7. 产物与模拟器兼容
- 下载的 zip 解压后 APK 放 `build_downloads/app/`（`mount_emulator.py` 递归识别；新 APK 修改时间更新会被优先选）。
- 验证 APK 有效性：前 4 字节应为 `50 4B 03 04`（zip 魔数），大小 ~62 MB。
- `build_downloads/` 不入 git（预存在未跟踪目录，勿提交）。

### 8. 提交前 tsc 验证：预存在错误别误判（2026-08-19 实测）
- `npx tsc --noEmit` 永远报 `src/i18n/index.ts(22,39): error TS2339: Property 'scriptCode' does not exist on type 'Locale'`（expo-localization 类型问题）——**预存在、与任何改动无关，看到它不代表编译会失败，忽略**（env skill 的「环境杂项」也有记载）。
- **GitHub Actions 构建不走 tsc**，该错误不影响 APK 编译；它只影响本地代码审查。判断自己的改动是否有类型错误：看 tsc 输出里是否只有这一条（有别的报错才是新问题）。

### 9. 单次 bash 全流程装机验证（2026-08-21 实测）
- **背景**：agent 环境的 bash 调用结束后会清理本次会话启动的后台进程（模拟器窗口“出现一下便消失”）。装机验证要**一次 bash 调用内完成**：启动模拟器 → 等 boot → 装 APK → 启动 app → 截图 → 查崩溃日志，不要跨调用。
- 模拟器启动必须用 **WMI**（`Invoke-CimMethod Win32_Process Create`，见 env skill「长驻进程保活」）；Python `subprocess.Popen(DETACHED_PROCESS)` 无效。
- 流程要点：
  1. 启动模拟器：`Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = '<emulator> -avd RichyTest -no-snapshot -no-audio -gpu swiftshader_indirect -no-boot-anim'; CurrentDirectory = '<项目根>' }`
  2. 轮询 `adb shell getprop sys.boot_completed` 到 `1`（RichyTest 约 45-50s）
  3. `adb install -r build_downloads/app/app-release.apk`（63MB 约 40-50s）
  4. `adb shell monkey -p com.richardchung.doctormeetslawyer -c android.intent.category.LAUNCHER 1` 启动
  5. `adb shell pidof <pkg>` 确认进程存活（空 = 启动失败/崩溃）
  6. `adb shell logcat -d -t 50 -s AndroidRuntime` 查 FATAL（有 = 崩溃）
  7. 截图：`subprocess.run([ADB,"exec-out","screencap","-p"], stdout=open(f,"wb"))`（capture_output=True 会被 cp1252 解码崩，见 env skill）
  8. 用 PIL 采样主色判断界面（`#F8FAFC` 背景 + `#E2E8F0` 边框 = app 浅色界面正常；纯白+黑 = 加载错误页；全黑 = 崩溃）
- 验证完成即可关闭模拟器（下轮重开），或保持运行供后续复用。

### 10. 并行双平台构建：gh_build_download.py 会误抓同 HEAD 的 iOS run（2026-08-25 实测）
- **现象**：Android + iOS 同时 dispatch（同一 HEAD → 同一 `head_sha`），`gh_build_download.py` 的 `find_run` 按 head_sha 匹配 run，会抓到**先创建的那个**（通常先是 dispatch 的 iOS run）。若该 iOS run 失败，脚本会把它当成 Android 构建报错退出（`[ERROR] 构建失败（failure）`），**APK 没下载**。
- **解法**：dispatch 返回的 `workflow_run_id` 才是**该 workflow 自己的 run**——Android 用 `python scripts/gh_build_download.py --run-id <该 id>` 只下载模式接续（不重新构建，直接查 artifact 下载）。
- **教训**：同一 HEAD 并行多 workflow 时，run 定位必须用 dispatch 返回值 / 显式 `--run-id`，不要依赖按 head_sha/名字猜（`GET runs` 列表里的同名历史 run 会干扰）。

## 成功路径速查

```powershell
# 完整链路（提交→构建→下载）
$env:PYTHONIOENCODING='utf-8'; python scripts/gh_build_download.py --interval 120 --timeout 40
# 只下载某次已成功的 run（不重新构建）
python scripts/gh_build_download.py --run-id <RUN_ID>

# 并行双平台构建（同一 HEAD）：分别 dispatch，各自用返回的 workflow_run_id 接续
#   触发 iOS 用 workflow_dispatch（见 ios-build skill 坑 9，旧 tag 会构建旧代码）
python scripts/gh_build_download.py --run-id <ANDROID_RUN_ID>
python scripts/gh_build_ios.py --run-id <IOS_RUN_ID> --interval 120 --timeout 90

# 安装到模拟器（自动选最新 APK）
python scripts/mount_emulator.py
```

轮询节奏：构建约 10 分钟，120 秒/次合适（`--interval 60` 也实测可用，不影响 API 限频），超时给 40 分钟。run 状态用
`GET /repos/{owner}/{repo}/actions/runs/{run_id}`，`status=completed` 后看 `conclusion`。

## 验证清单

- dispatch 返回 204 或 200（而非 401/403/404）；200 时 body 应含 `workflow_run_id`
- run `conclusion == success`（失败看 `html_url`）
- artifact zip 可下载且含 `.apk`；APK 魔数 `PK\x03\x04`
- `git status` 干净（`build_downloads/`、`scripts/sim/` 保持未跟踪）

## 注意

- 本 skill 与 `scripts/gh_build_download.py` 一样**不入 git**（`skills/`、`scripts/*.py` 均被 .gitignore 忽略）——换机器/换 agent 前记得连同 `keys.txt` 一起带走。
- APK 为 debug/release 自签名，真机首次安装需允许未知来源。

---
name: doctor-meets-lawyer-env
description: 本项目（Expo SDK 52 + Supabase + Windows + Android 模拟器）开发环境的踩坑记录与成功解法。接手本项目的 agent 先读此 skill，避免重复踩坑。涵盖：Metro 开发环境启动、后台进程保活、Expo Go 推送、EAS projectId、数据库迁移、浅色主题、node_modules 损坏、模拟器与 adb、**simulate/simToken 部署与自动同步**。
invocation: model+user
---

# Doctor Meets Lawyer — 开发环境与踩坑手册

## When to use

接手本仓库（Expo / React Native + Supabase + Windows 主机 + Android 模拟器）时**先读**；
遇到以下主题的报错或改动时**必查本节对应条目**：

- Metro / Expo Go 启动失败、bundle 不生效
- 推送通知（badge / in-app / 远程推送 / EAS projectId）
- 数据库迁移、Supabase 配置
- 主题与样式、中文品牌名
- 模拟器、adb、后台进程
- **Android 编译 / GitHub Actions 构建 APK：另见 `doctor-meets-lawyer-android-build` skill**（本机 `skills/` 下）

## 项目速览（30 秒版）

- 技术栈：Expo SDK 52（expo ~52.0.37）/ React Native 0.76.7 / TypeScript / Supabase（Postgres + Realtime + Edge Function）/ i18next（en、zh-Hans、zh-Hant）/ expo-notifications ~0.29.14
- 关键目录：`src/screens`、`src/components`、`src/lib`（`supabase.ts`、`notifications.ts`）、`src/theme.ts`、`supabase/migrations/`、`supabase/functions/notify/`、`scripts/`
- 数据库连接：`scripts/apply_migration.js` 内含生产库连接串（pooler + 明文密码，工具显示会脱敏，**读取请用 node 读文件原文**）；应用迁移 = `npm run apply-migration`（会按文件名顺序遍历 `supabase/migrations/*.sql`，所有迁移已幂等化，可重复跑）
- 提交约定：**每次修改代码后自行 `git commit`**，Conventional Commits 风格（`feat:`/`fix:`/`chore:`，英文描述）；提交前用 `git status` 核对范围。`.codewhale/`（运行时）、`build_downloads/`（产物）、`skills/`（本机知识文档）、`scripts/*.py`（本机工具）均被 `.gitignore` 忽略，不入 git——换机/换 agent 需连同 `keys.txt` 一起手动带走。
- Supabase 项目 ref：`xxtmeuabohgvcqzyphtx`（anon key 在 `src/lib/supabase.ts`，Edge Function URL 与 anon key 已写入数据库 `app_config` 表）

## 核心运行方式（重要）

- **开发迭代验证一律走 `scripts/dev_metro.py`（路径 B，不构建 APK）**：自动检查/安装环境 → 启动/复用模拟器 → 启动 Metro → 装/复用 Expo Go → deep link 打开 app 加载**最新源码**，改代码 Fast Refresh 即时生效。
- `scripts/mount_emulator.py` 只安装 `build_downloads/` 里**最新修改时间的预编译 APK**，JS/样式改动不生效——不要用它验证 JS 改动（它会误导你"改了没生效"）。
- **长驻进程保活（Windows + agent 环境）**：用 `Start-Process` 启动的进程会在 bash 命令返回后被清理（连 `time.sleep` 循环都跑不完，日志戛然而止）。必须用 WMI 创建完全独立的进程：
  ```powershell
  Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "..."; CurrentDirectory = "..." }
  ```
  这样父进程是 WMI 服务，跨 bash 调用存活。模拟器、python、Metro 都用此法启动。
  - **实测补充（2026-08-21）**：Python 的 `subprocess.Popen(..., creationflags=DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP)` **同样无效**——进程父链仍是 bash 会话，调用一结束整个进程树被环境清理（症状：模拟器窗口“出现一下便消失”、`adb devices` 无设备）。只有 WMI 方式（父进程 = WMI 服务）跨 bash 调用存活。Python 脚本内要启长驻进程时，也应回到 PowerShell WMI 一行式（或 `subprocess.run(["powershell", "-c", "Invoke-CimMethod ..."])`）。
- 启动 Metro 必须带 `EXPO_OFFLINE=1`（`dev_metro.py` 已内置）：非交互模式下，Expo Go 版本不匹配会弹交互式确认，CLI 无法输入直接 `CommandError` 退出，Metro 随之死亡。`EXPO_OFFLINE=1` 时只要 Expo Go 已安装就跳过版本校验（见 `node_modules/@expo/cli/build/src/start/platforms/ExpoGoInstaller.js`）。

## 踩坑清单（按主题）

### 1. 主题（浅色）与中文品牌名
- 原项目颜色**全硬编码**（Tailwind slate 暗色系）。改主题只动 `src/theme.ts`（语义令牌：`background`/`surface`/`surfaceMuted`/`border`/`text*`/`primary`/`primaryDark`/`danger` 等），各文件引用 `theme.colors.*`。
- **反色场景不要全盘替换**：强调色按钮上的白字（FAB、提交、发送）、自己的消息气泡深蓝 `#0EA5E9`、模态遮罩 `rgba(0,0,0,0.75)`、职业配色 `PROFESSION_COLORS`（database.ts）都要保留。
- 浅色背景上的链接/标题/名字文字用 `primaryDark`（`#0284C7`，sky-600）；`#38BDF8`（sky-400）在浅色背景对比度不足，仅用于装饰图标/深色气泡。
- 中文品牌名「医法会/醫法會」已从全部 UI/i18n 移除（commit `a7a91b4`）；`app_title` 三种语言统一为 "Doctor Meets Lawyer"。
- **遗留相邻问题**：`app.json` 的 `userInterfaceStyle` 仍是 `"dark"`，splash/adaptiveIcon 背景仍是 `#0F172A`（浅色主题改造时遗漏）。动它之前先与用户确认。

### 2. node_modules 损坏（Metro 起不来的经典案例）
- 症状：`Cannot find module './builders/react/buildChildren.js'`（`@babel/types` 文件缺失）；`node_modules/@babel/` 下出现异常目录名 `@babel/traverse--for-generate-function-map`；`npm install` 秒回（~11s）不修复。
- 解法：**删除 `node_modules` 全量重装** `npm install --legacy-peer-deps`（本项目约 32s，941 包）。修复后 `@babel/types/lib/builders/react/buildChildren.js` 应存在。

### 3. Expo Go 与推送通知
- `npx expo client:install:android` 在本项目本地 CLI **不被支持**（报错要求用 `expo start --android`）。
- 旧 CDN URL（`d1ahtucjixef4r.cloudfront.net/Exponent-2.32.x.apk`）已 403 失效。SDK 52 的 Expo Go 在 **GitHub releases**（`Expo-Go-2.32.20.apk`）；动态获取用 `https://api.expo.dev/v2/versions` 查 `sdkVersions["52.0.0"].androidClientUrl`。注意：**Python `urllib` 请求该 API 会被 403**（CloudFront 拒默认 UA），必须带 `User-Agent`。
- `getExpoPushTokenAsync` 报 `No "projectId" found`：`app.json` 缺 `extra.eas.projectId`。解法：`npx eas init --non-interactive --force`（**多账号必须 `--force`**，否则报错），会自动写入 `projectId` 与 `owner`；`src/lib/notifications.ts` 已做三级读取兜底（`Constants.easConfig` → `expoConfig.extra.eas` → `manifest2.extra.eas`），缺 projectId 时优雅降级只留本地通知。
- **平台限制**：Android 远程推送在 **Expo Go 中不可用**（官方警告 SDK 53 起移除，需 development build / release APK）；iOS Expo Go 可用；in-app 本地通知（`showLocalNotification`）两平台 Expo Go 均可用。
- 推送完整链路（代码 + 数据库侧已就绪）：客户端 `syncPushToken()` 把 Expo token 写 `profiles.push_token` → `messages` INSERT 触发器 `notify_new_message`（pg_net 异步调 Edge Function，失败不影响插入）→ `supabase/functions/notify` 查收件人 token 调 Expo Push API。
- **状态（2026-08-21）**：notify / simulate / rc-webhook **均已部署**（用 `SUPABASE_ACCESS_TOKEN` 环境变量 + CLI，无需浏览器交互；access token 在 `supabase keys.txt`）。部署命令：`supabase functions deploy <name> --project-ref xxtmeuabohgvcqzyphtx`（notify/rc-webhook 加 `--no-verify-jwt`；simulate 保持默认 verify_jwt=true，daemon 调用时带 anon key JWT + X-SIM-TOKEN）。**simulate 的 SIM_TOKEN 自动同步见第 9 节**（2026-08-26 已用 Management API 跑通，有现成脚本）。
- **剩余项**：数据库 `push_token` 需用户**登录 app 后**才写入（`syncPushToken` 只在登录态执行）。

### 4. 模拟器与 adb
- AVD `RichyTest` 在**默认位置** `~/.android/avd/`。**不要**把 `ANDROID_AVD_HOME` 设成 SDK 目录，否则 `emulator -list-avds` 找不到它（会误判"无 AVD"去新建）。
- 软件渲染（SwiftShader）模拟器上安装 **211MB 级大 APK（Expo Go 升级包）会卡死模拟器系统**（`adb shell` 无响应）。规避：用 `EXPO_OFFLINE=1` 跳过版本升级，不要尝试升级 Expo Go。
- adb 挂起（命令无响应）：`taskkill /f /im adb.exe` 全部杀掉 + 杀 python 重启 `dev_metro.py`；模拟器（`emulator.exe`/`qemu-system-x86_64.exe`）保留即可，脚本会复用健康设备（`sys.boot_completed=1`）。
- 模拟器重启后要重跑 `dev_metro.py`（它会重新 `adb reverse tcp:8081` 并 deep link 打开 app）。
- **屏幕状态验证**：`adb exec-out screencap -p > x.png` + PowerShell `System.Drawing` 采样主色：纯白+少量黑/蓝 = Expo Go 加载/连接错误页；含 `#F8FAFC`（背景）+ `#0EA5E9`（主题蓝）+ `#E2E8F0`/`#F1F5F9`（边框/表面） = app 浅色界面正常。

### 5. 数据库迁移与验证
- `init_schema.sql` 的 `ALTER PUBLICATION ... ADD TABLE` 已改为 DO 块存在性检查（否则重跑报 `relation already member of publication`，commit `41f0c1b`）。所有迁移可安全重复执行。
- `apply_migration.js` 已增强为遍历 `supabase/migrations/*.sql`（脚本曾被 gitignore 但**历史已跟踪**，改完要 `git commit`）。
- 推送产物验证（只读查询）：`profiles.push_token` 列、`app_config` 两行（`push_notify_url`/`push_notify_auth`）、触发器 `trg_notify_new_message`。
- 数据库只读验证技巧：写临时 node 脚本，`eval` 出 `apply_migration.js` 里的 `Client` 配置（用 `fs.readFileSync` 读原文，工具显示会脱敏）查询；**用完删除脚本，不要落盘密码**。

### 6. 环境杂项
- Windows PowerShell 5.1 **不支持 `??` 运算符**；多行复杂脚本写临时 `.ps1` 文件再执行。
- 项目 tsconfig 的 `exclude` 含 `supabase/functions`（Deno 环境不进项目 tsc）；`npx tsc --noEmit` 唯一长期错误是 `src/i18n/index.ts:22` 的 `Locale.scriptCode`（expo-localization 类型问题，**预存在、与任何改动无关，忽略**）。
- `build_downloads/`（APK、截图）与 `.codewhale/`（运行时目录）不进版本库；`scripts/*.py` 被 gitignore 忽略（本地工具不提交）。

### 7. dev_metro 热重载验证（路径 B）与常见坑
- **后台启动 + 日志落盘**：`dev_metro.py` 是长驻脚本（Metro 起来后不退出），用 WMI 独立进程启动时**必须**经 `cmd /c ... > dev_metro.log 2>&1` 重定向日志（WMI 的 Create 不提供 stdout 重定向），再轮询日志判断进度。
- **Metro 就绪判据**：日志行是 `[METRO] Dev environment ready. Metro keeps running; app reloads on edits.`（**不是** "Metro is running"）。
- **端口 8081 误判（已修）**：dev_metro.py 原实现杀 stale Metro 后，第二轮 `netstat -ano | findstr ":8081"` 未过滤状态，把 `TIME_WAIT`/`SYN_SENT` 的客户端连接尝试行也当"端口仍占用"→ FATAL。已改为只认 `LISTENING` 行。再遇 "Port 8081 still in use" 先 `netstat -ano | findstr ":8081" | findstr "LISTENING"` 确认是否真有 LISTENING。
- **截图二进制破坏**：PowerShell 里 `adb exec-out screencap -p > x.png` 的 `>` 是文本重定向，会损坏 PNG（`System.Drawing` 报 "Out of memory"）。必须 `cmd /c "adb exec-out screencap -p > x.png"` 保持二进制。
- **Python subprocess 抓屏同样有二进制坑**：`subprocess.run(["adb","exec-out","screencap","-p"], capture_output=True)` 会用文本模式解码（cp1252）→ `UnicodeDecodeError` 崩溃。必须 `subprocess.run(..., stdout=open("x.png","wb"))` 或 Popen 直接写文件（2026-08-21 实测）。
- **热重载判断**：Metro ready + Expo Go deep link 加载最新 bundle + 界面采样正常 → Fast Refresh 可用，**纯 JS/样式改动无需重编译 APK**；只有 native 改动（app.json 插件、gradle 依赖等）才走 `gh_build_download.py` 重新构建。
- **收尾**：杀 dev_metro 主进程后 Metro（node）可能残留——按 `netstat -ano | findstr ":8081" | findstr "LISTENING"` 取 PID 杀掉；模拟器（emulator.exe/qemu-system）保留供下次复用。
- **模拟器快照导致"重开没重载/画面冻结"（已修）**：模拟器默认快照机制（关闭保存、重开恢复），dev_metro.py 原 Windows 分支启动参数没禁快照 → 用户关掉虚拟机后重开，画面回到关闭前；且已恢复的 Expo Go 旧实例直接 `am start` deep link 不会重载 bundle（连接已断）→ 冻结。已修：启动参数加 `-no-snapshot`（禁 load+save，每次冷启动），`open_app_in_emulator` 在 deep link 前 `adb shell am force-stop host.exp.exponent` 强制冷启动加载最新 bundle。**验证信号**：`metro.log` 出现 `Android Bundled ... index.js (... modules)` = 真的重新打包加载了（不是旧画面）。
- **scripts 脚本区分**：`scripts/README.md` 有完整说明——JS/样式改动用 `dev_metro.py`；验证正式 APK 用 `mount_emulator.py`；编译下载 APK 用 `gh_build_download.py`。

### 8. iOS Modal 键盘遮挡：KeyboardAvoidingView + 点击收起（2026-08-25 修复，commit `45584e5`）
- **现象**：编辑简介（ProfileScreen）、发布话题（FeedScreen）的 **Modal 内 TextInput** 获得焦点时，iOS 上系统键盘盖住「储存/发布」按钮；点遮罩收不回键盘（无 dismiss 交互）→ 用户只能强退 app；Android（Samsung A5）正常。
- **根因**：RN `Modal` 在 iOS 用 UIViewController 呈现，**不自动 resize 内容**适应键盘；Android 的 Modal Dialog 设了 `SOFT_INPUT_ADJUST_RESIZE`（`node_modules/react-native/ReactAndroid/.../ReactModalHostView.kt:281`）所以内容自动上移。
- **修复模式（新增 Modal 输入场景照此办理）**：
  1. Modal 内容最外层 `View` 换成 `KeyboardAvoidingView`，`behavior={Platform.OS === 'ios' ? 'padding' : undefined}`（Android 不设，靠系统 adjustResize，避免双重偏移）。
  2. 底层加 `<Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} />`，点空白处收起键盘。
  3. 保存/发布按钮的 `onPress` 开头先 `Keyboard.dismiss()`。
- `app.json` 的 `android.softwareKeyboardLayoutMode` 显式 `"resize"`（Expo 默认值，显式化防回归）。
- 参照：ChatRoomScreen 底部输入栏早已用 `KeyboardAvoidingView`（同一模式）。
- 相关坑：Expo `ios.buildNumber` 默认 `'1'` 且被字面写入 CFBundleVersion，TestFlight 二次上传需递增——见 ios-build skill 坑 8。

### 9. simulate / simToken：部署、自动同步与坑（2026-08-26 全链路已验证）

**simToken 是什么（别和用户密码混淆）**：`scripts/sim/config.json` 的 `simToken` 是 Edge Function `simulate` 的**共享密钥** `SIM_TOKEN`，函数端用 `Deno.env.get('SIM_TOKEN')` 逐字节比对请求头 `x-sim-token`（`supabase/functions/simulate/index.ts`），不一致返回 401。它是「服务间共享密钥」——验证调用方是自己人，**不是**用户登录密码；静态、无过期、无刷新，每次调用传同一个值。它**只影响「注册新角色」一个动作**，不影响已有角色发帖/回复。

**为什么不能「读回」现有值**：Supabase secrets 是**单向写入**——CLI 只有 `secrets set`（写）与 `secrets list`（只列名称），Dashboard 不回显值，Management API 的 GET 也只返回名称列表。所以「自动获得 simToken」唯一路径 = **本地生成新值 → 推送云端 → 写回 config.json**，三者同步。

**自动同步脚本（现成，跑过即用）**：`scripts/sim/sync_sim_token.mjs`（在项目根执行 `node scripts/sim/sync_sim_token.mjs`）。流程：读 keys.txt 的 `supabase access token`（`sbp_` 开头）→ Management API `GET /v1/projects/{ref}/secrets`（验证端点/权限）→ `POST /v1/projects/{ref}/secrets` body `[{name:'SIM_TOKEN',value:<新值>}]`（实测返回 201）→ GET 复查 → 写回 config.json。新值 = `crypto.randomBytes(32).toString('hex')`（64 hex 字符）。**无需重新部署函数**（secrets 即时生效）。

**已验证的 Management API 事实（2026-08-26 实测）**：
- Base：`https://api.supabase.com/v1`，认证 `Authorization: Bearer <sbp token>`，project ref = `xxtmeuabohgvcqzyphtx`。
- `GET /projects/{ref}/secrets` → 200，返回 `{secrets:[{name,...}]}`（含 `SUPABASE_*` 默认项与自定义项，SIM_TOKEN 已在列）。
- `POST /projects/{ref}/secrets` body 为数组 → 201，批量 upsert，同名覆盖。
- 不需要 `supabase link`、不需要浏览器登录、不需要 npx 下载 CLI。
- 若 GET 401/403：keys.txt 的 access token 已失效，需去 Supabase Dashboard → Account → Access Tokens 重新生成并更新 keys.txt。

**坑（务必记住）**：
- **工具显示脱敏 ≠ 真实值**：`read` 工具读 `config.json` 会把 `simToken` 显示成 `[redacted]`，node 读原文才是真值。2026-08-26 前 config.json 的 simToken 实际是**空字符串**（不是 `[redacted]`），导致 simulate 注册从未真正可用；已用上述脚本修复并同步云端。
- 手动用 CLI 改云端时**必须同时改 config.json**，漏改 → daemon 注册新角色 401；`simToken` 与云端不一致时 `/api/state` 的 `simConfigured` 仍可能为 true（它只看 `!!cfg.simToken`），别被误导。
- CLI 备选方案（若 Management API 不可用）：`$env:SUPABASE_ACCESS_TOKEN='sbp_...'; npx supabase secrets set SIM_TOKEN=<值> --project-ref xxtmeuabohgvcqzyphtx`。
- `scripts/sim/` 整个不入 git，`sync_sim_token.mjs`、keys.txt、config.json、roles.json 换机/换 agent 时要**一起手动带走**。

### 10. simctl.ps1 前台模式（2026-08-26 改写 + 修复）

- **`start` 现在的语义**：启动 daemon（WMI 保活）+ 自动 run + **自动用 Edge/Chrome 应用窗口模式打开面板前台**，然后脚本前台挂起；**用户关闭该浏览器窗口（或整个浏览器）→ 实例主进程退出 → 脚本自动执行 stop**（连 daemon 一起停）。
- **关键实现（必须用独立 profile）**：`--app=<url> --user-data-dir=<scripts/sim/.browser_profile>` 强制启动**独立浏览器实例**，然后 `Wait-Process` 绑定该实例主进程。**绝不能只绑 `Start-Process -PassThru` 返回的 PID 而不带独立 profile**——已踩坑：本机已有浏览器实例在跑时，`--app=` 会被转发给现有实例，启动器进程立即退出 → `Wait-Process` 立刻返回 → daemon 刚启动就被误停（症状：面板一开就没了 / `sim_daemon.log` 只有「啟動運行循環」没有后续）。
- 启动后先轮询确认浏览器进程存活（最多 10 秒）再进入等待，避免把「无 GUI 启动失败」误判成「窗口已关闭」而误停 daemon。
- **排障日志**：simctl 自身操作写 `scripts/sim/sim_ctl.log`（start/stop 每一步、浏览器 exe/pid/profile、窗口关闭时刻）；daemon 输出在项目根 `sim_daemon.log`。**「不成功」先看 `sim_ctl.log` 定位是哪一步断了**。
- `start -NoBrowser`：启动但**不开浏览器**、启动后即返回（无 GUI / 自动化测试用）；daemon 在背景，用 stop 停止。
- **坑 1**：脚本挂起期间按 Ctrl+C 不会停止 daemon（WMI 进程独立于脚本），只会让「等浏览器关闭」失效——daemon 仍在背景跑，用 stop 或另行处理；再次 start 会提示「已在运行」。
- **坑 2**：`simctl.ps1` 必须是 **UTF-8 带 BOM**，否则 PowerShell 5.1 把中文按 ANSI 误解析报错（写完用 `[System.IO.File]::WriteAllText(..., New-Object System.Text.UTF8Encoding $true)` 补 BOM）。

### 11. sim 内容质量与真人回复（2026-08-26 修复，实测样本）

- **「不回应真人私讯」根因（已修）**：`syncRealConversations` 首次发现真人会话时把 `lastRepliedTs` 设为「发现时刻」，导致真人**已发**的私讯被当作历史忽略，之后没新消息就永不回复（症状：`reply_real` 事件 = 0，角色 `realConversations` 有记录但 `todayMessages=0`）。**修复**：首次接入时查最后一条真人消息，水位线设为「最后一条真人消息时间 - 1ms」，最新消息会被检测并回复（正常走选 2-3 条逻辑，历史多也不会刷屏）。
- **空帖（已修）**：`deepseek-v4-flash` 偶发返回空内容，`actionPost` 原来无保护直接插入空帖（实测 6 帖 2 空）。**修复**：`actionPost` 空内容跳过并记 `post_topic_empty` 错误事件；`chat()` 层新增质量检查（`qualityOk`）——空文本 / 含简体特征字（`SIMPLIFIED_CHARS` 集合，仅检测不转换，避免多义字误伤）→ 自动重试一次 LLM。日志会显示 `⚠️ LLM 輸出空內容/含簡體字，重試一次`。
- **简体中文（已修）**：`personaSystem` 增加「严禁简体字，必须正体字」+ 常见示例（記錄≠纪录、規例≠规例、寵物≠宠物、獸醫≠兽医、診症≠诊症、幾耐≠几耐、問題≠问题）；配合 `chat()` 简体检测重试双保险。
- **打太极（不直接拒绝，2026-08-26）**：`personaSystem` 新增规则——「严禁直接拒绝对方请求」：遇到做不到/不想做/尴尬的请求（约会、表白、借钱、要联系方式等），**既不拒绝也不答应**，用幽默、曖昧、反问或转移话题回应，让对话继续。严禁「唔得／唔得閒／唔好喇／咪搞我」这类直接拒绝（实测 bot 曾回「約就真係唔得啦」把用户推开），改为「睇吓先啦／遲啲先講／約就睇緣分啦」这类留余地的话。
- **发帖话题单一（已修，2026-08-26）**：`genTopic` 的 prompt 原来写死「關於醫療與法律交叉的有趣或實用話題」，导致全部帖子都是「医疗纪录/法律责任/保障自己」同一类（实测 11 条有效帖 100% 医疗法律交叉）。**修复**：新增 `TOPIC_TYPES` 三分类，`pickTopicType()` 代码层加权随机选型（40% 专业讨论 / 30% 职业生活点滴 / 30% 日常琐事），每类 prompt 附示例（如「你地點睇呢個 case？」、「今日遇到個好有趣嘅病人」、「我養咗隻狗」），分布已单测验证（10 万次抽样 ≈ 40/30/30）。
- **发帖上下文感知（避免重复主题/句型，2026-08-26）**：多个 bot 独立发帖会撞主题（如多个「宠物」帖）或撞句型（如多个「...到邊/到底...」开场）。**修复**：`genTopic` 发帖前先 `fetchRecentTopics`（以角色 JWT 查 topics 表最近 24 小时、`is_active=true` 的前 20 条帖子），把「大厅现有帖子清单」注入 prompt 作上下文——**生活类**（life/daily）要求避免主题重复（已有宠物就不再发宠物主题），**专业类**（pro）允许主题重复但禁止句型重复（已有「你地點睇呢個 case」就改用「咁嘅情況大家有咩諗法」）。dry-run 下返回空列表，行为不变。
- **空内容发帖频繁（已修，2026-08-26）**：日志显示空内容跳过（`post_topic_empty`）一小时内出现 12 次，同期 BAi 网关频繁 `Request timed out`（20:55–21:44）。根因有二：① `chat()` 只重试 1 次且重试走同一通道（BAi 故障时必然连续空）；② `fetchRecentTopics` 注入 20 条帖子使 prompt 过载。**修复**：① `chat()` 空内容/简体内脏时重试 2 次（总 3 次调用），**发帖重试前冷却 30 秒**（`chat(..., 30000)`）避免过度频繁 API 请求，**私讯/注册走默认 0 冷却**（保持秒级响应）——不再强制切换通道；② `fetchRecentTopics` limit 从 20 降到 10，减轻 prompt 长度。
- **虚构原则（不借用真实人/事，2026-08-26）**：`personaSystem` 新增——「所有个人信息一律必须虚构，严禁借用真实存在的人和事」：不得给出真实详细地址、诊所/公司/店名、真实姓名、真实头衔、真实履历、真实人物关系；描述背景要模糊、避免过于具体。**被刨根问底追问细节时用打太极应对**（模糊带过/开玩笑/反问/转移话题），既不让用户不满，也不暴露自己是虚拟人设（例如不要被套出「你是哪间诊所」「你叫什么名」）。
- **排障入口**：内容类问题看 `sim_daemon.log`（发帖/回复/重试日志）+ `events.db`（`node:sqlite` 查 `post_topic`/`reply_real`/`error` 事件）；simctl 问题看 `scripts/sim/sim_ctl.log`。

### 12. 真人回复与发帖 tick 分离（2026-08-26 重构）

- **问题**：真人回复原嵌入在发帖 tick（3-10 分钟间隔）里，即使回填时间戳伪装成 3-60 秒前，**实际回复动作仍发生在 tick 触发时**，用户看到的是 3-10 分钟延迟。
- **修复（架构拆分）**：
  - `replyPoller`：独立 `setInterval`（`replyPollSeconds`，默认 5 秒），高频扫描所有在线角色的真人会话，发现新私讯后交给 `scheduleReply`；发帖 tick 只保留发帖/静默。
  - `scheduleReply`：**每个会话各自用 `setTimeout` 从「该会话最新私讯时间 + 随机延迟(3-60 秒)」独立计时**触发回复——多会话互不等待、各自从各自私讯起算（即「回覆不同用户的计时从收到私讯的时间个别设限」）；有新私讯会重排（从最新私讯重新起算）。
  - 并发门控：`maxRepliesPerTick` 作为同时进行中的回复数上限（默认 5），超限 2 秒后重试不丢弃。
- **`created_at` 改为实际回复时刻**：不再伪装过去的时间戳（真实回复已在 3-60 秒内发生）。
- **坑 1**：`replyPollSeconds` 热更新不生效（setInterval 固定间隔），改后需重启 daemon。
- **坑 2**：`replyPollSeconds` 设太小（< 2 秒）会高频查询数据库（每角色每 2 秒查 conversations + messages），角色多时注意 Supabase 用量；`syncRealConversations` 已加 `changed` 标志，无变化不写盘。
- **重复回复同一私讯（已修，2026-08-26）**：竞态——timer 触发时 `replyTimers.delete` 执行、但 `actionReplyReal` 仍在进行（LLM 耗时数秒），期间 poller 每 5 秒扫描发现该会话无定时器且 `lastRepliedTs` 未推进 → 重复排定新 timer → 同一私讯被回多次（实测：`reply_real` 事件 09:20:58 / 09:22:25 / 09:22:42 各与上一条 incoming 相同）。**修复双重防线**：① `replyingSet` 标记正在回覆中的会话，`scheduleReply` 看到即跳过；② timer 触发时重新 `findPendingIncoming`，若 `fresh` 为空（已被其他路径回覆）则放弃。stop/pause 时 `replyingSet` 一并清空。
- **最新私讯滞留（已修，2026-08-26）**：`replyingSet` 期间 poller 跳过安排，回复完成后 `replyingSet.delete` 到 poller 下一次运行之间有 5 秒窗口，用户恰在此时发的最新私讯会滞留 5 秒才被检测。**修复**：`actionReplyReal` 的 `finally` 块中，在 `replyingSet.delete` 后立即 `findPendingIncoming(role, conv)` 检查该会话是否有新消息，有则立即 `scheduleReply`（不等 poller 下一轮）。同时回复失败（LLM 调用异常）也会由此自动重试安排，不再需要等待 poller。

## 当前状态快照（2026-08-18）

已完成：浅色主题（`2865849`）→ topic hall 24h 窗口 + 每用户 3 条上限（`6dd49aa`）→ 点击用户名看对方 profile（`56771ef`）→ 移除中文品牌名（`a7a91b4`）→ Chats 未读徽标 + 推送通知（`3a55194`、`bfb909f`）→ EAS projectId 修复（`504755e`）→ 迁移幂等化（`41f0c1b`）→ 修复 auth 注册全挂 search_path（`cc70db4`）→ simulate 接口（`f879b8f`）→ 话题 2 行截断 + 话题/私讯字数限制（`cf6d75f`）。
后续：iOS Modal 键盘遮挡修复（`45584e5`）→ iOS buildNumber 递增（`5fcc8fe`）。
待办：部署 notify/simulate Edge Function；用户登录 app 后注册 push_token；`app.json` 浅色化（`userInterfaceStyle`/splash/adaptiveIcon）需用户确认。

## Non-goals

- 不要用 `mount_emulator.py` 验证 JS 改动；不要尝试给模拟器升级大体积 Expo Go。
- 不要在未确认前改动生产数据库结构（迁移执行前说明幂等/可回滚性）。
- 不要把 `.codewhale/` 运行时文件或 `build_downloads/` 产物提交进 git。

---
name: doctor-meets-lawyer-env
description: 本项目（Expo SDK 52 + Supabase + Windows + Android 模拟器）开发环境的踩坑记录与成功解法。接手本项目的 agent 先读此 skill，避免重复踩坑。涵盖：Metro 开发环境启动、后台进程保活、Expo Go 推送、EAS projectId、数据库迁移、浅色主题、node_modules 损坏、模拟器与 adb。
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

## 项目速览（30 秒版）

- 技术栈：Expo SDK 52（expo ~52.0.37）/ React Native 0.76.7 / TypeScript / Supabase（Postgres + Realtime + Edge Function）/ i18next（en、zh-Hans、zh-Hant）/ expo-notifications ~0.29.14
- 关键目录：`src/screens`、`src/components`、`src/lib`（`supabase.ts`、`notifications.ts`）、`src/theme.ts`、`supabase/migrations/`、`supabase/functions/notify/`、`scripts/`
- 数据库连接：`scripts/apply_migration.js` 内含生产库连接串（pooler + 明文密码，工具显示会脱敏，**读取请用 node 读文件原文**）；应用迁移 = `npm run apply-migration`（会按文件名顺序遍历 `supabase/migrations/*.sql`，所有迁移已幂等化，可重复跑）
- 提交约定：**每次修改代码后自行 `git commit`**，Conventional Commits 风格（`feat:`/`fix:`/`chore:`，英文描述）；提交前用 `git status` 核对范围，`.codewhale/` 与 `build_downloads/` 不进版本库（只提交 `.codewhale/skills/` 内的 skill 文件除外）
- Supabase 项目 ref：`xxtmeuabohgvcqzyphtx`（anon key 在 `src/lib/supabase.ts`，Edge Function URL 与 anon key 已写入数据库 `app_config` 表）

## 核心运行方式（重要）

- **开发迭代验证一律走 `scripts/dev_metro.py`（路径 B，不构建 APK）**：自动检查/安装环境 → 启动/复用模拟器 → 启动 Metro → 装/复用 Expo Go → deep link 打开 app 加载**最新源码**，改代码 Fast Refresh 即时生效。
- `scripts/mount_emulator.py` 只安装 `build_downloads/` 里**最新修改时间的预编译 APK**，JS/样式改动不生效——不要用它验证 JS 改动（它会误导你"改了没生效"）。
- **长驻进程保活（Windows + agent 环境）**：用 `Start-Process` 启动的进程会在 bash 命令返回后被清理（连 `time.sleep` 循环都跑不完，日志戛然而止）。必须用 WMI 创建完全独立的进程：
  ```powershell
  Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "..."; CurrentDirectory = "..." }
  ```
  这样父进程是 WMI 服务，跨 bash 调用存活。模拟器、python、Metro 都用此法启动。
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
- **未完成项**：Edge Function 尚未部署（`npx supabase login && npx supabase link --project-ref xxtmeuabohgvcqzyphtx && npx supabase functions deploy notify`，需用户账号交互认证）；数据库 `push_token` 需用户**登录 app 后**才写入（`syncPushToken` 只在登录态执行）。

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

## 当前状态快照（2026-08-17）

已完成：浅色主题（`2865849`）→ topic hall 24h 窗口 + 每用户 3 条上限（`6dd49aa`）→ 点击用户名看对方 profile（`56771ef`）→ 移除中文品牌名（`a7a91b4`）→ Chats 未读徽标 + 推送通知（`3a55194`、`bfb909f`）→ EAS projectId 修复（`504755e`）→ 迁移幂等化（`41f0c1b`）。
待办：部署 notify Edge Function；用户登录 app 后注册 push_token；`app.json` 浅色化（`userInterfaceStyle`/splash/adaptiveIcon）需用户确认。

## Non-goals

- 不要用 `mount_emulator.py` 验证 JS 改动；不要尝试给模拟器升级大体积 Expo Go。
- 不要在未确认前改动生产数据库结构（迁移执行前说明幂等/可回滚性）。
- 不要把 `.codewhale/` 运行时文件或 `build_downloads/` 产物提交进 git。

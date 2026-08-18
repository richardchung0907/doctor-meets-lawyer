# scripts/ — 脚本使用说明

本目录工具较多，**最常搞混的是 `dev_metro.py` 与 `mount_emulator.py`**。
一句话区分：

- **`dev_metro.py`** = 开发模式（Metro + Expo Go + 热重载）——**改 JS/TS/样式代码用它**。
- **`mount_emulator.py`** = 安装正式编译的 APK——**验证 release 构建产物用它**，JS 改动用它看不到效果。

---

## 快速决策表（什么时候用哪个）

- **改代码（JS/TS/样式）要看效果** → `python scripts/dev_metro.py`
  （模拟器 + Metro 起好后，改代码 Fast Refresh 即时生效，**不需要重编译 APK**）
- **拿到正式 APK 要装进模拟器验证**（GitHub Actions 编译的、或本机 gradle 编的） → `python scripts/mount_emulator.py [APK 路径]`
  （不传路径会自动选 `build_downloads/` 里修改时间最新的 APK）
- **要把最新代码编译成 APK 给真机/正式验证** → `python scripts/gh_build_download.py`
  （自动提交推送 → 触发 GitHub Actions → 每 2 分钟轮询 → 下载到 `build_downloads/app/`；非交互，token 在 `keys.txt`）
- **应用/更新数据库迁移** → `npm run apply-migration`
  （等价 `node scripts/apply_migration.js`，按文件名顺序执行 `supabase/migrations/*.sql`，幂等可重跑）
- **本地 bot 人气仿真控制中枢** → `scripts/sim/`（`node scripts/sim/daemon.mjs`，面板 `http://127.0.0.1:8787`）
- **CI/自动化模拟器冒烟** → `ci_emulator_runner.py`（一般用户不用碰）

---

## 各脚本详情

### dev_metro.py —— 开发模式（推荐日常使用）
- 用途：自动搭建 **模拟器 + Metro + Expo Go** 开发环境，Expo Go 加载**当前源码**；JS/样式改动保存后 Fast Refresh 即时生效。
- 用法：`python scripts/dev_metro.py`（可加 `--clear` 清 Metro 缓存、`--avd <名字>` 指定 AVD、`--no-reinstall` 跳过 npm 检查）
- 注意事项：
  - **这是验证 JS/TS/样式改动的唯一推荐路径**。不要用 `mount_emulator.py` 验证 JS 改动（它装的是预编译 APK，JS 改动不生效，会误导你"改了没效果"）。
  - 模拟器启动已禁用快照（`-no-snapshot`），每次冷启动保证加载最新 bundle；Expo Go 会强制重启新实例，避免旧画面冻结。
  - 脚本长驻（Metro 在跑），完成后停止：杀掉进程即可（模拟器可保留，下次复用）。
  - 纯 JS 改动**不需要**重新编译 APK；只有 native 改动（app.json 插件、gradle 依赖等）才走 `gh_build_download.py`。

### mount_emulator.py —— 安装正式 APK 到模拟器
- 用途：把指定（或 `build_downloads/` 里最新）的 release APK 安装到模拟器并启动。
- 用法：`python scripts/mount_emulator.py [apk 路径]`
- 注意事项：
  - **只用于验证正式构建产物**（推送、图标、原生模块、真机行为等）。
  - 它不会加载 JS 热重载；模拟器里显示的是 APK 打包那一刻的代码。
  - 常见误解："我改了界面颜色，mount 之后没变化" → 因为 APK 是旧的，JS 改动用 `dev_metro.py`。

### gh_build_download.py —— 云端编译并下载 APK
- 用途：提交最新代码 → 触发 GitHub Actions `build-android.yml` → 轮询（默认每 2 分钟）→ 自动下载 APK 到 `build_downloads/app/`。
- 用法：`python scripts/gh_build_download.py`（`--run-id <id>` 只下载某次已成功的构建，不重新编译）
- 注意事项：全程非交互（token 来自 `keys.txt`）；完整构建约 10 分钟。

### apply_migration.js —— 数据库迁移
- 用途：执行 `supabase/migrations/*.sql`（按文件名顺序，幂等）。
- 用法：`npm run apply-migration`
- 注意事项：连接串（含明文密码）在该文件内，属敏感信息，不要外传/提交。

### sim/ —— 本地 bot 控制中枢（演示期人气仿真）
- 用途：单进程编排多个模拟用户注册/发帖/聊天；浏览器面板控制与监察。
- 用法：`node scripts/sim/daemon.mjs` → 浏览器开 `http://127.0.0.1:8787`。
- 注意事项：**本机专用，整个目录不入 git**；DeepSeek key 与 simulate 部署见 `skills/doctor-meets-lawyer-android-build` 与 `doctor-meets-lawyer-env`。

### ci_emulator_runner.py —— CI 模拟器测试
- 用途：CI/自动化环境在模拟器上跑冒烟检查（agent 使用，普通用户不需要）。

---

## 常见困惑解答

1. **"改了代码，mount_emulator 后没变化"**
   → 因为装的是旧 APK。JS 改动用 `dev_metro.py` 看效果；要新的 APK 先跑 `gh_build_download.py` 再 mount。

2. **"dev_metro 打开的 app 停在旧画面 / 冻结"**
   → 模拟器快照残留问题（旧版只禁保存不禁加载）。已修复：启动加 `-no-snapshot` + Expo Go 强制 `force-stop` 后重新 deep link。若仍异常，删除 AVD 快照后重跑（或 `--clear`）。

3. **"什么时候需要重新编译 APK？"**
   → 只有 native 侧改动（`app.json` 插件、`android/` 原生代码、gradle 依赖、Expo SDK 升级）需要；纯 JS/TS/样式永远走 `dev_metro.py` 热重载。

# scripts/appstore — App Store 上架自动化脚本

> 来源：从 `C:\Users\User\Desktop\MYproject\Filter_APP2\scripts\` 拷贝（该专案已成功上架全球 App Store）。
> 这些 `.py` 脚本与 `scripts/` 下其它本机工具一样被 `.gitignore` 忽略（`*.py`），不入 git。
> 完整背景与使用流程见 `skills/doctor-meets-lawyer-ios-release/SKILL.md`。

## 目录结构约定

- `keys.txt`（项目根）：App Store Connect 凭据（Issuer ID / Key ID / 证书密码 / profile 名 / p12 base64）。
- `ios-signing/`（项目根）：签名文件（`AuthKey_*.p8`、`certificates.p12` 等）。脚本已适配从该目录读取。
- 所有脚本已统一适配：`PROJECT_DIR` 向上两级（脚本位于 `scripts/appstore/`）、p8 从 `ios-signing/` 读取。

## 脚本清单

构建链（CI 侧）：

- `setup_github_secrets.py` — 把本机 keys 与签名文件加密后上传为 GitHub Actions secrets（pynacl）。仓库已改为本专案；Android 段因本专案无 keystore 会自动跳过；iOS 段在创建好本项目 provisioning profile 后才能完整运行。

上架链（App Store Connect REST API + JWT ES256）：

- `submit_version_101.py` — 最完整的上架样板：创建 App Store 版本 → 声明出口合规 → 关联 build → 批量更新各语言 whatsNew/reviewNotes → 创建 reviewSubmission 并提交审核（带失败回退提示）。
- `verify_appstore_state.py` — 实时核对：版本挂载的 build、各本地化的截图数量。
- `upload_screenshots_appstore.py` — 截图上传：reservation → 分块 PUT → commit，遍历全部本地化。
- `update_promotional_text.py` — 批量更新各语言宣传文本。
- `get_categories.py` — 查询可用分类。
- `inspect_appstore_connect.py` — 全面审计 App Store Connect 元数据（分类/定价/隐私 URL/描述/TestFlight 状态）。
- `patch_appstore_connect.py` — 通用元数据修改（分类、隐私政策 URL 等）。
- `process_screenshots.py` — 原始图 → 6.5" 截图（1242×2688 PNG，Pillow LANCZOS），输入 `appScreenshots/raw/`。
- `process_55_screenshots.py` — 原始图 → 5.5" 截图（1242×2208 PNG）。

## 使用前提

```powershell
pip install requests pyjwt pynacl pillow
```

- `keys.txt` 中需有 5 个 ASC 相关 key（Issuer ID / Key ID / 证书密码 / profile 名 / p12 base64），本项目已合并进 `keys.txt`。
- `ios-signing/AuthKey_LSLS88W574.p8` 与 `ios-signing/certificates.p12` 已就位（账号级，可复用）。

## 尚待适配的硬编码（实施上架时改）

这些脚本从 Filter_APP2 拷贝，其中面向对方 App 的业务值尚未改，跑之前必须逐个替换：

- `app_id = "6792005935"` — 对方 App 的 App Store Connect ID；本项目创建 App 记录后替换。
- bundle id `com.richylite.richyLite` — 换成 `com.richardchung.doctormeetslawyer`。
- 本地化集合（10 语言）与文案 — 本项目只需 `en-US` / `zh-Hans` / `zh-Hant`（香港区）。
- `patch_appstore_connect.py` 中 `privacy_url = "https://richardchung0907.github.io/richy-Lite/"` — 换成本项目隐私政策 URL（审核必需）。
- 截图尺寸：Apple 现要求随最新 iPhone 更新（实施时确认是否需要 6.9"）。
- build id / version string：每次发版按实际情况填（参考 `submit_version_101.py` 内注释）。

## 安全注意

- 本目录、`ios-signing/`、`docs/appstore/`、`keys.txt` 均不入 git。
- 不要在任何输出中打印证书密码 / p8 私钥内容。
- App Store Connect API 有速率限制，脚本内已带 1.5s 延迟，勿删除。

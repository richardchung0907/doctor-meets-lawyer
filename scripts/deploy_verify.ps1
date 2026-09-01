# ==========================================================
# 專業身份認證 — 部署與設定腳本
# 用法：在專案根目錄執行以下命令
# ==========================================================
# 先決條件：
#   1. 已安裝 supabase CLI（以下會自動安裝）
#   2. 已取得 Supabase access token（登入 supabase 用）
#      - 到 https://supabase.com/dashboard/account/tokens 建立
#      - 或直接使用 supabase keys.txt 中的 token
# ==========================================================

Write-Host '=== 步驟 1: 登入 Supabase CLI ==='
Write-Host '請先取得 Supabase access token（https://supabase.com/dashboard/account/tokens）'
Write-Host '然後執行：'
Write-Host '  npx supabase login'
Write-Host ''
Write-Host '=== 步驟 2: 連結專案 ==='
Write-Host '  npx supabase link --project-ref xxtmeuabohgvcqzyphtx'
Write-Host ''
Write-Host '=== 步驟 3: 設定 Secrets（郵件憑證） ==='
Write-Host '  npx supabase secrets set EMAIL_SENDER=chungkachai0907@gmail.com'
Write-Host '  npx supabase secrets set EMAIL_RECEIVER=chungkachai0907@gmail.com'
Write-Host '  npx supabase secrets set EMAIL_APP_PASSWORD="jkyi qyhe xfcw giyl"'
Write-Host ''
Write-Host '=== 步驟 4: 部署 Edge Function ==='
Write-Host '  npx supabase functions deploy verify-request'
Write-Host ''
Write-Host '=== 完成 ==='
Write-Host ''
Write-Host '驗證：'
Write-Host '  1. 用戶在 app 個人中心點「認證」→ 上傳證明文件 → 提交'
Write-Host '  2. 檢查郵箱（chungkachai0907@gmail.com）收到審核通知'
Write-Host '  3. 執行管理端：node scripts/verify_admin.mjs'
Write-Host '  4. 在管理端核准後，該用戶身份旁會顯示「已認證」'
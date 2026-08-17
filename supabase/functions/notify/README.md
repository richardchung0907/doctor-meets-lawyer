# notify — Expo 远程推送 Edge Function

收到数据库触发器 `notify_new_message` 的调用（携带 `message_id`），查询消息与会话，
向**收件人**（非发送者）的 Expo Push Token 发送系统级远程推送（非 in-app）。

## 部署

```bash
npx supabase login
npx supabase link --project-ref xxtmeuabohgvcqzyphtx
npx supabase functions deploy notify
```

迁移 `20260817000000_push_notifications.sql` 必须先应用（`npm run apply-migration`），
其中 `app_config` 表已写入本函数端点 URL 与项目 anon key。

## 平台限制

- **iOS**：Expo Go 与正式构建均支持远程推送。
- **Android**：远程推送在 **Expo Go 中不可用**（官方限制），需 development build
  或 release APK；本地（in-app）通知在 Expo Go 中可用。
- 应用在前台时，客户端还会通过 Realtime + 本地通知立即弹出 in-app 横幅
  （见 `src/lib/notifications.ts` 与 `App.tsx` 的全局消息订阅）。

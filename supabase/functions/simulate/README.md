# Edge Function: simulate

人气仿真埋点接口（长期运作，真实运营后持续使用）。只做一件事：**批量创建 App 用户（角色）**。

发帖、回复真人由本机控制中枢 `scripts/sim/daemon.mjs`（**不入 git**）用各角色自己的 JWT
直接写入数据库，走与 App 完全相同的 RLS 路径，本函数不参与。

## 部署

```bash
npx supabase login
npx supabase link --project-ref xxtmeuabohgvcqzyphtx
npx supabase secrets set SIM_TOKEN=<随机串>
npx supabase functions deploy simulate
```

> `SIM_TOKEN` 必须与 `scripts/sim/config.json` 里的 `simToken` 一致。

## 调用契约

```
POST https://xxtmeuabohgvcqzyphtx.supabase.co/functions/v1/simulate
Headers:
  Authorization: Bearer <anon key>
  X-SIM-TOKEN: <SIM_TOKEN>
  Content-Type: application/json

Body:
{
  "action": "create_user",
  "email": "dr.wang@example.com",
  "password": "…随机密码…",
  "username": "王医生",
  "profession": "medical_doctor",   // 7 选 1，非法值回落 "other"
  "gender": "male",                  // 可选
  "age": "38",                       // 可选，纯数字字符串
  "bio": "三甲医院心内科主治医师",     // 可选
  "avatar_url": "https://…",         // 可选
}

成功: 200 { "ok": true, "id": "<uuid>" }
失败: 401 密钥错误 / 409 email 已存在 / 400 参数缺失 / 500 内部错误
```

注册成功后，Postgres 触发器 `handle_new_user` 自动创建 `profiles` 行，
daemon 用该 email/password `signInWithPassword` 即可取得角色 JWT。

## 注意

- `service_role` 密钥只存在于本函数环境变量中，绝不写入客户端或本机脚本。
- 本接口不校验话题/消息内容，不参与业务逻辑，最小化攻击面。
- 长期运作：真实运营后持续使用；鉴权为共享密钥 `X-SIM-TOKEN`，须妥善保管并定期更换。

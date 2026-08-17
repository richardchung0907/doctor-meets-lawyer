// Supabase Edge Function: notify
//
// 由数据库触发器（supabase/migrations/20260817000000_push_notifications.sql 中的
// notify_new_message）在 messages 表插入新消息时异步调用，向收件人发送
// Expo 远程推送（non in-app 系统通知，兼容 iOS / Android）。
//
// 部署（在项目根目录）：
//   npx supabase login
//   npx supabase link --project-ref xxtmeuabohgvcqzyphtx
//   npx supabase functions deploy notify
//
// 环境变量由 Supabase 自动注入：
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//
// 注意：
//   - Android 的远程推送在 Expo Go 中不可用，需要 development build 或
//     release APK（expo-notifications 的官方平台限制）；
//   - iOS 在 Expo Go 中可用。

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const { message_id } = await req.json();
    if (!message_id) {
      return json(400, { ok: false, error: 'missing message_id' });
    }

    const { data: msg, error } = await supabase
      .from('messages')
      .select('conversation_id, sender_id, content, conversations!inner(participant1_id, participant2_id)')
      .eq('id', message_id)
      .single();

    if (error || !msg) {
      return json(404, { ok: false, error: 'message not found' });
    }

    const conv = msg.conversations as { participant1_id: string; participant2_id: string };
    const recipientId = conv.participant1_id === msg.sender_id ? conv.participant2_id : conv.participant1_id;

    // 黑名单防御：任一方拉黑对方，则不发送推送（RLS 已阻断插入，此为兜底）
    const { data: block, error: blockErr } = await supabase
      .from('blocked_users')
      .select('blocker_id')
      .or(
        `and(blocker_id.eq.${msg.sender_id},blocked_id.eq.${recipientId}),` +
        `and(blocker_id.eq.${recipientId},blocked_id.eq.${msg.sender_id})`
      );
    if (!blockErr && (block?.length ?? 0) > 0) {
      return json(200, { ok: true, skipped: 'blocked' });
    }

    const [{ data: recipient }, { data: sender }] = await Promise.all([
      supabase.from('profiles').select('push_token').eq('id', recipientId).maybeSingle(),
      supabase.from('profiles').select('username').eq('id', msg.sender_id).maybeSingle(),
    ]);

    if (!recipient?.push_token) {
      return json(200, { ok: true, skipped: 'recipient has no push token' });
    }

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: recipient.push_token,
        title: sender?.username || 'New message',
        body: (msg.content ?? '').slice(0, 150),
        sound: 'default',
        data: { conversation_id: msg.conversation_id },
      }),
    });

    return json(200, { ok: true, expo: await res.text() });
  } catch (err) {
    return json(500, { ok: false, error: String(err) });
  }
});

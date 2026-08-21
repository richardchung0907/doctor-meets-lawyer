// Supabase Edge Function: rc-webhook
//
// RevenueCat webhook 接收端：把订阅事件落库到 profiles（权威来源），
// 客户端 SDK listener 只做即时 UI 反馈（非权威）。
//
// 部署（在项目根目录）：
//   npx supabase login
//   npx supabase link --project-ref xxtmeuabohgvcqzyphtx
//   npx supabase functions deploy rc-webhook
//   npx supabase secrets set RC_WEBHOOK_SIGNING_SECRET=<RevenueCat Dashboard 里的 signing secret>
//
// 环境变量：
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY —— Supabase 自动注入
//   RC_WEBHOOK_AUTH_TOKEN —— 可选；若设置，校验 Authorization 头（当前已在 RevenueCat 配
//                            `Bearer rc-webhook-proje2683dd6`，建议部署后设为同值）
//   RC_WEBHOOK_SIGNING_SECRET —— 可选；若设置，校验 X-RevenueCat-Webhook-Signature（HMAC-SHA256）
//
// 参考：docs/revenuecat/guides/webhooks.md（签名格式与验签要求，必须用原始请求体字节）

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// 订阅有效事件：更新为 premium = true（按到期时间）
const ACTIVE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'TRANSFER',
  'NON_RENEWING_PURCHASE',
]);

function msToIso(ms: number | null | undefined): string | null {
  if (!ms) return null;
  return new Date(ms).toISOString();
}

function verifyAuth(req: Request): boolean {
  const token = Deno.env.get('RC_WEBHOOK_AUTH_TOKEN');
  if (!token) return true; // 未配置则不强制
  return req.headers.get('Authorization') === token;
}

// 常量时间比较（hex 字符串），避免时序攻击
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  const secret = Deno.env.get('RC_WEBHOOK_SIGNING_SECRET');
  if (!secret) return true; // 未配置签名密钥则不强制
  if (!signature) return false;

  // 格式: t=<unix_timestamp>,v1=<hmac_sha256_hex>
  const m = /t=(\d+),v1=([0-9a-f]+)/i.exec(signature);
  if (!m) return false;
  const [, timestamp, v1] = m;

  // 防重放：15 分钟内（与 RevenueCat 推荐一致）
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 900) return false;

  const key = new TextEncoder().encode(secret);
  const data = new TextEncoder().encode(`${timestamp}.${rawBody}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const expected = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return safeEqualHex(expected, v1);
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return json(405, { ok: false, error: 'method not allowed' });
    }

    // 1. Authorization 校验（可配）
    if (!verifyAuth(req)) {
      return json(401, { ok: false, error: 'unauthorized' });
    }

    // 2. 取原始 body（签名验证必须用原始字节）
    const rawBody = await req.text();
    if (!rawBody) {
      return json(400, { ok: false, error: 'empty body' });
    }

    // 3. 签名校验（可配，启用后强制）
    const sigHeader = req.headers.get('X-RevenueCat-Webhook-Signature');
    if (!(await verifySignature(rawBody, sigHeader))) {
      return json(401, { ok: false, error: 'invalid signature' });
    }

    // 4. 解析事件
    const event = JSON.parse(rawBody);
    const type: string = event?.event ?? '';
    const userId: string | undefined = event?.app_user_id;
    const expiresAtMs: number | null | undefined = event?.expiration_at_ms;

    if (!userId) {
      return json(400, { ok: false, error: 'missing app_user_id' });
    }

    // 防御：app_user_id 必须是合法 UUID（本项目的 supabaseUid）；非法输入直接 400 不重试
    // （否则 Postgres 会报 invalid uuid 语法 → 500 → RevenueCat 无限重试）
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(userId)) {
      return json(400, { ok: false, error: 'invalid app_user_id (must be uuid)' });
    }

    // 5. 按事件类型更新 profiles（权威落库）
    if (ACTIVE_EVENTS.has(type)) {
      // 购买/续订/变更/恢复 → 身份生效；订阅给到期时间，非订阅（lifetime）到期为 null
      const expiresAt = msToIso(expiresAtMs);
      const { error } = await supabase
        .from('profiles')
        .update({ is_premium: true, premium_expires_at: expiresAt })
        .eq('id', userId);
      if (error) return json(500, { ok: false, error: error.message });
      return json(200, { ok: true, action: 'activate', expires_at: expiresAt });
    }

    if (type === 'EXPIRATION') {
      // 到期 → 身份失效（若到期时间仍未来则保留）
      const stillValid = expiresAtMs ? expiresAtMs > Date.now() : false;
      const { error } = await supabase
        .from('profiles')
        .update({ is_premium: stillValid, premium_expires_at: msToIso(expiresAtMs) })
        .eq('id', userId);
      if (error) return json(500, { ok: false, error: error.message });
      return json(200, { ok: true, action: 'expire', is_premium: stillValid });
    }

    if (type === 'CANCELLATION') {
      // 取消 → 权益保留至到期日（Apple 规则），到期时间由后续 EXPIRATION 事件落库
      return json(200, { ok: true, action: 'cancel_keeps_until_expiry', note: 'no-op' });
    }

    // 其余事件（BILLING_ISSUE / PAYWALL_EVENT 等）暂不处理
    return json(200, { ok: true, action: 'ignored', event: type });
  } catch (err) {
    return json(500, { ok: false, error: String(err) });
  }
});

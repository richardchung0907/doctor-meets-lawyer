// Supabase Edge Function: verify-request
//
// 專業身份認證申請端點：
//   1. 驗證登入 JWT（必須是已登入用戶）
//   2. 接收 multipart/form-data：file（證明文件）+ note（可選備註）
//   3. 上傳到 Storage bucket verification-docs/<user_id>/<filename>
//   4. 寫入 verification_requests 表（status=pending，trigger 自動把 profile 設為 pending）
//   5. 用 Gmail SMTP 發送審核通知郵件給管理員
//
// 部署：
//   npx supabase login
//   npx supabase link --project-ref xxtmeuabohgvcqzyphtx
//   npx supabase secrets set EMAIL_SENDER=xxx EMAIL_RECEIVER=xxx EMAIL_APP_PASSWORD=xxx
//   npx supabase functions deploy verify-request
//
// 環境變量（Supabase 自動注入）：
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// 自訂 secret：
//   EMAIL_SENDER / EMAIL_RECEIVER / EMAIL_APP_PASSWORD（Gmail SMTP）

import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

// 允許的檔案類型與大小限制（防止濫用）
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/pdf',
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function extForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/heic': return 'heic';
    case 'image/heif': return 'heif';
    case 'application/pdf': return 'pdf';
    default: return 'bin';
  }
}

async function sendReviewEmail(user: { email?: string; username?: string; profession?: string }, note: string, reqId: string) {
  const sender = Deno.env.get('EMAIL_SENDER');
  const receiver = Deno.env.get('EMAIL_RECEIVER');
  const appPassword = Deno.env.get('EMAIL_APP_PASSWORD');
  if (!sender || !receiver || !appPassword) {
    console.error('verify-request: EMAIL_* secrets not configured, skipping email');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: sender, pass: appPassword },
  });

  const subject = `[醫法會] 專業身份認證申請待審核 — ${user.username ?? '用戶'} (${user.profession ?? 'unknown'})`;
  const text = [
    `有新的專業身份認證申請，請到管理端審核。`,
    ``,
    `申請 ID: ${reqId}`,
    `用戶郵箱: ${user.email ?? 'N/A'}`,
    `用戶名: ${user.username ?? 'N/A'}`,
    `身份: ${user.profession ?? 'N/A'}`,
    `備註: ${note || '（無）'}`,
    ``,
    `管理端：node scripts/verify_admin.mjs（查看待審清單並核准/拒絕）`,
  ].join('\n');

  await transporter.sendMail({
    from: sender,
    to: receiver,
    subject,
    text,
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return json(405, { ok: false, error: 'method not allowed' });
    }

    // 1. 驗證登入 JWT：Authorization: Bearer <user JWT>
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json(401, { ok: false, error: 'missing bearer token' });
    }
    const token = authHeader.slice('Bearer '.length);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return json(401, { ok: false, error: 'invalid token' });
    }

    // 2. 解析 multipart/form-data
    const form = await req.formData();
    const file = form.get('file');
    const note = String(form.get('note') ?? '').trim().slice(0, 500);

    if (!(file instanceof File)) {
      return json(400, { ok: false, error: 'missing file field' });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return json(400, { ok: false, error: `unsupported file type: ${file.type}` });
    }
    if (file.size > MAX_FILE_SIZE) {
      return json(400, { ok: false, error: 'file too large (max 5MB)' });
    }
    if (file.size === 0) {
      return json(400, { ok: false, error: 'empty file' });
    }

    // 3. 檢查是否已有 pending/verified 申請（防重複提交）
    const { data: existing, error: existErr } = await supabase
      .from('verification_requests')
      .select('id, status')
      .eq('user_id', user.id)
      .in('status', ['pending'])
      .maybeSingle();
    if (existErr) return json(500, { ok: false, error: existErr.message });
    if (existing) {
      return json(409, { ok: false, error: 'already has a pending request' });
    }

    // 4. 上傳到 Storage（私有 bucket，RLS 保證只有本人/審核者可讀）
    const filename = `${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`;
    const docPath = `${user.id}/${filename}`;
    const { error: uploadErr } = await supabase.storage
      .from('verification-docs')
      .upload(docPath, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });
    if (uploadErr) {
      return json(500, { ok: false, error: `upload failed: ${uploadErr.message}` });
    }

    // 5. 查詢用戶 profession（用於郵件）
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('username, profession')
      .eq('id', user.id)
      .maybeSingle();
    if (profErr) return json(500, { ok: false, error: profErr.message });

    // 6. 寫入 verification_requests（status 預設 pending）
    const { data: reqRow, error: insertErr } = await supabase
      .from('verification_requests')
      .insert({
        user_id: user.id,
        profession: prof?.profession ?? 'other',
        doc_path: docPath,
        status: 'pending',
      })
      .select('id')
      .single();
    if (insertErr) {
      // 上傳成功但入庫失敗 → 清理孤兒文件
      await supabase.storage.from('verification-docs').remove([docPath]);
      return json(500, { ok: false, error: `insert failed: ${insertErr.message}` });
    }

    // 7. 發送審核郵件（失敗不阻斷申請，僅記日誌）
    try {
      await sendReviewEmail(
        { email: user.email, username: prof?.username, profession: prof?.profession },
        note,
        reqRow.id
      );
    } catch (mailErr) {
      console.error('verify-request: email send failed', mailErr);
    }

    return json(200, { ok: true, request_id: reqRow.id });
  } catch (err) {
    console.error('verify-request error:', err);
    return json(500, { ok: false, error: String(err) });
  }
});

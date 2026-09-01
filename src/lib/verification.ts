import { supabase } from './supabase';

const FUNCTION_URL = 'https://xxtmeuabohgvcqzyphtx.supabase.co/functions/v1/verify-request';

export interface VerificationFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
}

export interface SubmitResult {
  ok: boolean;
  error?: string;
  request_id?: string;
}

/**
 * 提交專業身份認證申請：
 *   - 攜帶當前登入用戶 JWT（Edge Function 驗證）
 *   - multipart/form-data 上傳（file + note）
 * 返回 ok / error
 */
export async function submitVerificationRequest(
  file: VerificationFile,
  note: string
): Promise<SubmitResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, error: 'auth_required' };
  }

  if (file.size != null && file.size > 5 * 1024 * 1024) {
    return { ok: false, error: 'file_too_large' };
  }

  const form = new FormData();
  // React Native 上傳需 { uri, name, type } 結構
  form.append(
    'file',
    { uri: file.uri, name: file.name, type: file.type } as unknown as Blob
  );
  form.append('note', note);

  try {
    const res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = typeof body?.error === 'string' ? body.error : `http_${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true, request_id: body?.request_id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

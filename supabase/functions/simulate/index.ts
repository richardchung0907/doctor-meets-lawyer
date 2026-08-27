// Supabase Edge Function: simulate
//
// 人气仿真埋点接口（长期运作，真实运营后持续使用）。
// 唯一职责：以 service role 批量创建 App 用户（角色），绕过注册速率限制
// 与邮箱验证。发帖/回复真人由本机 daemon 用各角色自己的 JWT 直插数据库
// （与 App 完全相同的 RLS 路径），不需要经过本函数。
//
// 鉴权：
//   - Authorization: Bearer <anon key>（满足平台默认 JWT 校验）
//   - X-SIM-TOKEN: <SIM_TOKEN>（共享密钥，部署时设置，防止匿名刷号）
//
// 部署：
//   npx supabase login
//   npx supabase link --project-ref xxtmeuabohgvcqzyphtx
//   npx supabase secrets set SIM_TOKEN=<随机串>
//   npx supabase functions deploy simulate
//
// 环境变量（Supabase 自动注入）：
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const PROFESSIONS = [
  'medical_doctor',
  'tcm',
  'dentist',
  'veterinarian',
  'lawyer',
  'judge',
  'other',
];

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return json(405, { ok: false, error: 'method not allowed' });
    }

    // 1) 共享密钥校验
    const simToken = Deno.env.get('SIM_TOKEN');
    if (!simToken || req.headers.get('x-sim-token') !== simToken) {
      return json(401, { ok: false, error: 'unauthorized' });
    }

    const body = await req.json();
    if (body?.action !== 'create_user') {
      return json(400, { ok: false, error: 'unsupported action (only create_user)' });
    }

    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const username = String(body.username ?? '').trim();
    if (!email || !password || !username) {
      return json(400, { ok: false, error: 'email/password/username required' });
    }

    let profession = String(body.profession ?? 'other');
    if (!PROFESSIONS.includes(profession)) profession = 'other';

    const ageRaw = body.age;
    const age = ageRaw !== undefined && ageRaw !== null && String(ageRaw).match(/^\d+$/)
      ? String(ageRaw)
      : null;

    // 2) admin 创建用户；现有触发器 handle_new_user 会自动建 profile
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        profession,
        username,
        gender: body.gender ? String(body.gender) : 'other',
        age,
        bio: body.bio ? String(body.bio) : '',
        avatar_url: body.avatar_url ? String(body.avatar_url) : null,
      },
    });

    if (error) {
      // email 已存在等业务错误透传
      return json(409, { ok: false, error: error.message });
    }
    return json(200, { ok: true, id: data?.user?.id ?? null });
  } catch (err) {
    return json(500, { ok: false, error: String(err) });
  }
});

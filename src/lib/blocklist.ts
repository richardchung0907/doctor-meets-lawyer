import { supabase } from './supabase';

export interface BlockedEntry {
  blocked_id: string;
  created_at: string;
  blocked_user?: Array<{
    id: string;
    username: string | null;
    profession?: string | null;
  }> | null;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * 当前用户与 otherUserId 是否存在黑名单关系（任一方向存在即生效）。
 */
export async function isBlockedWith(otherUserId: string): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) return false;
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocker_id')
    .or(
      `and(blocker_id.eq.${uid},blocked_id.eq.${otherUserId}),` +
      `and(blocker_id.eq.${otherUserId},blocked_id.eq.${uid})`
    );
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/**
 * 当前用户是否拉黑了 otherUserId（仅我→对方方向）。
 */
export async function isBlockedByMe(otherUserId: string): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) return false;
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocker_id')
    .eq('blocker_id', uid)
    .eq('blocked_id', otherUserId)
    .maybeSingle();
  return !error && !!data;
}

/** 把 otherUserId 加入我的黑名单。 */
export async function blockUser(otherUserId: string): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) return false;
  const { error } = await supabase
    .from('blocked_users')
    .insert({ blocker_id: uid, blocked_id: otherUserId });
  if (error) {
    console.error('Failed to block user:', error);
    return false;
  }
  return true;
}

/** 把 otherUserId 移出我的黑名单。 */
export async function unblockUser(otherUserId: string): Promise<boolean> {
  const uid = await currentUserId();
  if (!uid) return false;
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', uid)
    .eq('blocked_id', otherUserId);
  if (error) {
    console.error('Failed to unblock user:', error);
    return false;
  }
  return true;
}

/** 拉取我当前拉黑的用户列表（含用户名/职业，按拉黑时间倒序）。 */
export async function fetchMyBlocklist(): Promise<BlockedEntry[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_id, created_at')
    .eq('blocker_id', uid)
    .order('created_at', { ascending: false });
  if (error || !data || data.length === 0) {
    return [];
  }

  // blocked_users 对 profiles 有两个外键（blocker_id/blocked_id），
  // postgrest 的嵌套 join 别名不可靠，改为两段查询后客户端合并。
  const ids = data.map((r) => r.blocked_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, profession')
    .in('id', ids);
  if (profilesError) {
    console.error('Failed to fetch blocked user profiles:', profilesError);
    return [];
  }
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  return data.map((row) => ({
    blocked_id: row.blocked_id,
    created_at: row.created_at,
    blocked_user: byId.get(row.blocked_id) ? [byId.get(row.blocked_id)!] : [],
  }));
}

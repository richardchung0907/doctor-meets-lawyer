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
    .select(
      `blocked_id,
       created_at,
       blocked_user:blocked_id (id, username, profession)`
    )
    .eq('blocker_id', uid)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Failed to fetch blocklist:', error);
    return [];
  }
  return (data ?? []) as BlockedEntry[];
}

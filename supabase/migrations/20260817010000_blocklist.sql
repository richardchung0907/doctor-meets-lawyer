-- Blocklist feature
--
-- 语义：
--   * 任一方把对方加入黑名单即生效（双向阻断）；
--   * 仅当双方互不在对方黑名单时，黑名单效力才取消；
--   * 被拉黑的一方不会收到任何通知；
--   * 旧会话保留可见，但新消息/新会话被 RLS 阻断；
--   * 被拉黑用户的话题在 Topic Hall 中通过 RLS 隐藏。

-- 1. Blocked users table (blocker_id 拉黑了 blocked_id)
CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- 2. RLS on blocked_users
-- 用户只能查看/管理“自己拉黑了谁”；被拉黑方看不到任何痕迹（不通知）。
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own blocklist" ON public.blocked_users;
CREATE POLICY "Users can view their own blocklist"
  ON public.blocked_users FOR SELECT
  TO authenticated
  USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "Users can block others" ON public.blocked_users;
CREATE POLICY "Users can block others"
  ON public.blocked_users FOR INSERT
  TO authenticated
  WITH CHECK (blocker_id = auth.uid() AND blocked_id <> auth.uid());

DROP POLICY IF EXISTS "Users can unblock" ON public.blocked_users;
CREATE POLICY "Users can unblock"
  ON public.blocked_users FOR DELETE
  TO authenticated
  USING (blocker_id = auth.uid());

-- 3. Topics SELECT: hide topics authored by anyone with a mutual block.
--    anon 的 auth.uid() 为 NULL，NOT EXISTS 恒真，匿名浏览不受影响。
DROP POLICY IF EXISTS "Active topics are viewable by authenticated users" ON public.topics;
CREATE POLICY "Active topics are viewable by authenticated users"
  ON public.topics FOR SELECT
  TO authenticated, anon
  USING (
    (is_active = true OR user_id = auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = topics.user_id)
         OR (b.blocker_id = topics.user_id AND b.blocked_id = auth.uid())
    )
  );

-- 4. Conversations INSERT: no new conversation while either side is blocked.
DROP POLICY IF EXISTS "Users can create conversations they participate in" ON public.conversations;
CREATE POLICY "Users can create conversations they participate in"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.uid() = participant1_id OR auth.uid() = participant2_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users b
      WHERE (b.blocker_id = participant1_id AND b.blocked_id = participant2_id)
         OR (b.blocker_id = participant2_id AND b.blocked_id = participant1_id)
    )
  );

-- 5. Messages INSERT: cannot send new messages while either side is blocked.
--    Old messages stay readable (SELECT policy unchanged).
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON public.messages;
CREATE POLICY "Users can send messages in their conversations"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid())
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.blocked_users b
        ON (b.blocker_id = c.participant1_id AND b.blocked_id = c.participant2_id)
        OR (b.blocker_id = c.participant2_id AND b.blocked_id = c.participant1_id)
      WHERE c.id = messages.conversation_id
    )
  );

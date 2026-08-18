-- ==========================================================
-- FIX: 拉黑对"被拉黑方"不生效（策略子查询被 blocked_users 自身 RLS 挡住）
-- ==========================================================
--
-- 症状：A 拉黑 B 后，B 下拉刷新话题大厅仍看到 A 的 topics，也仍能
--   给 A 发私讯（会话未锁）。
--
-- 根因：topics SELECT / conversations INSERT / messages INSERT 策略中
--   直接写 NOT EXISTS (SELECT ... FROM public.blocked_users ...)。Postgres
--   会对策略表达式里引用的表同样应用其 RLS：blocked_users 的 SELECT
--   策略是 blocker_id = auth.uid()（只能看到"自己拉黑了谁"）。因此
--   被拉黑方 B 在策略子查询中看不到 (A→B) 的记录 → NOT EXISTS 恒真
--   → A 的 topics 不过滤、给 A 发消息不被阻断。拉黑方 A 自己能查到
--   记录所以表现正常——这与"只有被拉黑方失效"的现象吻合。
--
-- 修复：新建 SECURITY DEFINER 函数 is_blocked(a, b)（以函数 owner
--   postgres 执行，绕过 blocked_users 的 RLS），策略统一改调该函数。
--   幂等，可重复执行。

-- ---- 1. 双向拉黑判定函数（SECURITY DEFINER 绕过 RLS） ----
CREATE OR REPLACE FUNCTION public.is_blocked(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  );
$$;

-- 权限：authenticated 需要能调用（函数在 public schema，默认可执行）
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) TO authenticated, anon;

-- ---- 2. topics SELECT：隐藏任一方拉黑对方的话题 ----
DROP POLICY IF EXISTS "Active topics are viewable by authenticated users" ON public.topics;
CREATE POLICY "Active topics are viewable by authenticated users"
  ON public.topics FOR SELECT TO authenticated, anon
  USING (
    (is_active = true OR user_id = auth.uid())
    AND NOT public.is_blocked(auth.uid(), topics.user_id)
  );

-- ---- 3. conversations INSERT：任一方拉黑对方则不能建新会话 ----
DROP POLICY IF EXISTS "Users can create conversations they participate in" ON public.conversations;
CREATE POLICY "Users can create conversations they participate in"
  ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = participant1_id OR auth.uid() = participant2_id)
    AND NOT public.is_blocked(participant1_id, participant2_id)
  );

-- ---- 4. messages INSERT：任一方拉黑对方则不能发新消息 ----
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON public.messages;
CREATE POLICY "Users can send messages in their conversations"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid())
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND public.is_blocked(c.participant1_id, c.participant2_id)
    )
  );

-- 注意：is_blocked(NULL, x) 返回 false（NULL 比较），故匿名浏览（anon，
-- auth.uid() 为 NULL）不受拉黑过滤影响，与原设计一致。

-- 验证方式：A 拉黑 B 后
--   1. B 查 topics → 看不到 A 的话题；A 查 topics → 看不到 B 的话题
--   2. B 给 A 发消息 / 建新会话 → 被拒
--   3. 无关第三方 C 仍能看到双方话题；C 查 blocked_users → 空（隐私保持）

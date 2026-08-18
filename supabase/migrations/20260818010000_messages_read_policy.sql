-- ==========================================================
-- FIX: messages / conversations 缺 UPDATE 策略，导致"标记已读"与
--      "会话 updated_at 触碰"被 RLS 静默拒绝
-- ==========================================================
--
-- 症状 1：进入私讯对话查看后返回，Conversations 列表未读徽标（蓝底）
--   与底部 tab 未读徽标（红底）仍显示旧计数，永不归零。
--   根因：客户端进入会话时 UPDATE messages SET is_read=true，但
--   messages 只有 SELECT/INSERT 策略、无 UPDATE → RLS 拒绝（客户端
--   未检查 error，静默失败）。
-- 症状 2：发消息后 conversations.updated_at 不更新（ChatRoomScreen
--   touch updated_at 同样被 RLS 拒绝）→ 会话列表排序陈旧。
--
-- 修复策略（兼容所有 PG 版本）：
--   列级权限（GRANT UPDATE (col)）限制"只能改哪一列" +
--   行级 RLS 策略限制"谁能改哪些行"。
--   幂等，可重复执行（REVOKE/GRANT 与 DROP POLICY IF EXISTS 均幂等）。

-- ---- messages：标记已读 ----
-- 收回表级 UPDATE（anon 不需要写；authenticated 只保留 is_read 列）
REVOKE UPDATE ON public.messages FROM anon, authenticated;
GRANT UPDATE (is_read) ON public.messages TO authenticated;

DROP POLICY IF EXISTS "Users can mark messages read in their conversations" ON public.messages;
CREATE POLICY "Users can mark messages read in their conversations"
  ON public.messages FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid())
    )
  )
  WITH CHECK (
    is_read = true
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid())
    )
  );

-- ---- conversations：发消息后触碰 updated_at（列表排序） ----
REVOKE UPDATE ON public.conversations FROM anon, authenticated;
GRANT UPDATE (updated_at) ON public.conversations TO authenticated;

DROP POLICY IF EXISTS "Users can touch updated_at in their conversations" ON public.conversations;
CREATE POLICY "Users can touch updated_at in their conversations"
  ON public.conversations FOR UPDATE TO authenticated
  USING (auth.uid() = participant1_id OR auth.uid() = participant2_id)
  WITH CHECK (auth.uid() = participant1_id OR auth.uid() = participant2_id);

-- 验证方式：
--   1. 收件人 UPDATE messages.is_read=true → 成功；改 content → 权限拒绝
--   2. 参与者 UPDATE conversations.updated_at → 成功；改其他列 → 权限拒绝
--   3. 非参与者 UPDATE → 行级拒绝

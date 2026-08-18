-- ==========================================================
-- FEAT: profiles.last_seen — 在线状态心跳（前台每 60s 更新）
-- ==========================================================
-- 客户端 App.tsx 在登录后、app 处于前台时每 60s 更新本行 last_seen；
-- 聊天室头部按"距今 < 2 分钟"判定对方在线。幂等，可重复执行。

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;

-- 索引：按最近活跃排序/过滤可选（数据量小，仅作提示，可不建）
-- CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen DESC);

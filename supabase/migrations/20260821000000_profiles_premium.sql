-- 2026-08-21: 高级会员身份落库（premium 为纯身份标识，暂无权益门槛）
-- 对应 RevenueCat entitlement `premium`（仅年费 premium_yearly）。
-- webhook 事件由 supabase/functions/rc-webhook 写入；客户端 SDK listener 只做 UI 即时反馈。

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS premium_expires_at timestamptz;

COMMENT ON COLUMN public.profiles.is_premium IS '高级会员身份（权威来源：RevenueCat webhook 落库）';
COMMENT ON COLUMN public.profiles.premium_expires_at IS '高级会员到期时间（年费制；到期后身份失效）';

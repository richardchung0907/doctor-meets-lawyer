-- ==========================================================
-- FEAT: Professional Identity Verification (三態認證系統)
-- 2026-09-01
-- ==========================================================
-- 三態：unverified（未認證）/ pending（審核中）/ verified（已認證）
-- 管理端在 scripts/verify_admin.mjs

-- 1. profiles 加 verification_status 欄位
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified';

COMMENT ON COLUMN public.profiles.verification_status IS '認證狀態：unverified | pending | verified';

-- 2. 新建 verification_requests 表
CREATE TABLE IF NOT EXISTS public.verification_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    profession public.profession_enum NOT NULL,
    doc_path text NOT NULL,          -- Storage 路徑（如 verification-docs/<user_id>/<filename>）
    status text NOT NULL DEFAULT 'pending',
    reviewer_note text,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON public.verification_requests(status);
CREATE INDEX IF NOT EXISTS idx_verification_requests_user ON public.verification_requests(user_id);

COMMENT ON TABLE public.verification_requests IS '專業身份認證申請記錄';
COMMENT ON COLUMN public.verification_requests.status IS 'pending | approved | rejected';
COMMENT ON COLUMN public.verification_requests.doc_path IS 'Storage 中證明文件的路徑（僅審核者可讀）';

-- 3. RLS 策略
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

-- 所有人可 INSERT 自己的申請（但 app 端只走 Edge Function，此為底線防禦）
DROP POLICY IF EXISTS "Users can insert own verification requests" ON public.verification_requests;
CREATE POLICY "Users can insert own verification requests"
    ON public.verification_requests FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- 用戶只能看自己的申請
DROP POLICY IF EXISTS "Users can view own verification requests" ON public.verification_requests;
CREATE POLICY "Users can view own verification requests"
    ON public.verification_requests FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- 不允許用戶 UPDATE/DELETE 申請（僅 service_role 可寫）
-- （service_role 繞過 RLS，無需額外策略）

-- 4. 審核通過時自動更新 profiles.verification_status 的函數
CREATE OR REPLACE FUNCTION public.handle_verification_approved()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
        UPDATE public.profiles
        SET verification_status = 'verified',
            updated_at = NOW()
        WHERE id = NEW.user_id;
    ELSIF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
        UPDATE public.profiles
        SET verification_status = 'unverified',
            updated_at = NOW()
        WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_verification_request_status_change ON public.verification_requests;
CREATE TRIGGER on_verification_request_status_change
    AFTER UPDATE OF status ON public.verification_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_verification_approved();

-- 5. 新申請時自動設 profile 為 pending
CREATE OR REPLACE FUNCTION public.handle_verification_request_insert()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.profiles
    SET verification_status = 'pending',
        updated_at = NOW()
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_verification_request_insert ON public.verification_requests;
CREATE TRIGGER on_verification_request_insert
    AFTER INSERT ON public.verification_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_verification_request_insert();

-- 6. Storage RLS 政策（bucket verification-docs 為私有）
-- 用戶只能讀/寫自己目錄下的文件；審核者用 service_role 繞過 RLS
DROP POLICY IF EXISTS "Users can upload own verification docs" ON storage.objects;
CREATE POLICY "Users can upload own verification docs"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'verification-docs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "Users can view own verification docs" ON storage.objects;
CREATE POLICY "Users can view own verification docs"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'verification-docs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "Users can update own verification docs" ON storage.objects;
CREATE POLICY "Users can update own verification docs"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'verification-docs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "Users can delete own verification docs" ON storage.objects;
CREATE POLICY "Users can delete own verification docs"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'verification-docs'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- 7. 授權
GRANT ALL ON public.verification_requests TO authenticated, anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
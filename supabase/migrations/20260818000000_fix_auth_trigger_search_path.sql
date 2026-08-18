-- ==========================================================
-- FIX: auth.users 触发器在平台 search_path 加固后失效
-- ==========================================================
--
-- 症状：所有新用户注册（App signUp / admin.createUser）返回
--   500 unexpected_failure "Database error creating/saving new user"
--
-- 根因：Supabase 平台将 GoTrue 连接角色 supabase_auth_admin 的
--   search_path 设为 'auth'（不含 public）。auth.users 上的触发器
--   on_auth_user_created 调用的 handle_new_user() 中，类型引用
--   profession_enum 未加 schema 前缀，在 search_path=auth 下解析
--   失败（"type \"profession_enum\" does not exist"），整个创建
--   用户事务回滚。平台加固前默认 search_path 含 public，故旧用户
--   注册正常、新注册全部失败。
--
-- 修复：类型引用加 public. 前缀，并显式 SET search_path = public。
-- 幂等，可重复执行。

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    prof_text TEXT;
    prof_val public.profession_enum;
BEGIN
    prof_text := new.raw_user_meta_data->>'profession';

    -- Cast string metadata to profession_enum safely
    BEGIN
        prof_val := prof_text::public.profession_enum;
    EXCEPTION WHEN OTHERS THEN
        prof_val := 'other'::public.profession_enum;
    END;

    INSERT INTO public.profiles (id, username, profession, gender, age, avatar_url, bio)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
        prof_val,
        new.raw_user_meta_data->>'gender',
        CASE WHEN (new.raw_user_meta_data->>'age') ~ '^[0-9]+$' THEN (new.raw_user_meta_data->>'age')::INTEGER ELSE NULL END,
        new.raw_user_meta_data->>'avatar_url',
        new.raw_user_meta_data->>'bio'
    )
    ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        profession = EXCLUDED.profession,
        updated_at = NOW();

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 重建触发器（幂等）
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 验证方式（注册一个用户或执行）：
--   select public.handle_new_user();  -- 仅触发器，不能直接调用
-- 用注册接口（signup / admin.createUser）验证。

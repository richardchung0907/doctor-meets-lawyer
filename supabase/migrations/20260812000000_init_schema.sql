-- ==========================================================
-- DOCTOR MEETS LAWYER - DATABASE MIGRATION SCHEMA
-- ==========================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Profession Type ENUM / Check Constraint
-- Canonical keys: medical_doctor, tcm, dentist, veterinarian, lawyer, judge, other
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profession_enum') THEN
        CREATE TYPE profession_enum AS ENUM (
            'medical_doctor',
            'tcm',
            'dentist',
            'veterinarian',
            'lawyer',
            'judge',
            'other'
        );
    END IF;
END
$$;

-- 3. Create PROFILES Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT,
    profession profession_enum DEFAULT 'other'::profession_enum,
    gender TEXT,
    age INTEGER,
    avatar_url TEXT,
    bio TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index on profession for multi-select feed filtering performance
CREATE INDEX IF NOT EXISTS idx_profiles_profession ON public.profiles(profession);

-- 4. Create TOPICS Table
CREATE TABLE IF NOT EXISTS public.topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes on topics for fast feed retrieval and filtering
CREATE INDEX IF NOT EXISTS idx_topics_is_active_created ON public.topics(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topics_user_id ON public.topics(user_id);

-- 5. Create CONVERSATIONS Table (1-on-1 Realtime Chat)
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participant1_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    participant2_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_conversation_pair UNIQUE (participant1_id, participant2_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_p1 ON public.conversations(participant1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_p2 ON public.conversations(participant2_id);

-- 6. Create MESSAGES Table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at ASC);

-- 7. AUTOMATED POSTGRES TRIGGER: on_auth_user_created
-- Automatically registers a user profile alongside their selected profession key upon signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    prof_text TEXT;
    prof_val profession_enum;
BEGIN
    prof_text := new.raw_user_meta_data->>'profession';
    
    -- Cast string metadata to profession_enum safely
    BEGIN
        prof_val := prof_text::profession_enum;
    EXCEPTION WHEN OTHERS THEN
        prof_val := 'other'::profession_enum;
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "Public profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Public profiles are viewable by authenticated users"
    ON public.profiles FOR SELECT
    TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

-- Topics Policies
DROP POLICY IF EXISTS "Active topics are viewable by authenticated users" ON public.topics;
CREATE POLICY "Active topics are viewable by authenticated users"
    ON public.topics FOR SELECT
    TO authenticated, anon
    USING (is_active = true OR user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own topics" ON public.topics;
CREATE POLICY "Users can insert own topics"
    ON public.topics FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own topics" ON public.topics;
CREATE POLICY "Users can update own topics"
    ON public.topics FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);

-- Conversations Policies
DROP POLICY IF EXISTS "Users can view conversations they participate in" ON public.conversations;
CREATE POLICY "Users can view conversations they participate in"
    ON public.conversations FOR SELECT
    TO authenticated
    USING (auth.uid() = participant1_id OR auth.uid() = participant2_id);

DROP POLICY IF EXISTS "Users can create conversations they participate in" ON public.conversations;
CREATE POLICY "Users can create conversations they participate in"
    ON public.conversations FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = participant1_id OR auth.uid() = participant2_id);

-- Messages Policies
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
CREATE POLICY "Users can view messages in their conversations"
    ON public.messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id
            AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "Users can send messages in their conversations" ON public.messages;
CREATE POLICY "Users can send messages in their conversations"
    ON public.messages FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = sender_id AND
        EXISTS (
            SELECT 1 FROM public.conversations c
            WHERE c.id = messages.conversation_id
            AND (c.participant1_id = auth.uid() OR c.participant2_id = auth.uid())
        )
    );

-- 9. ENABLE SUPABASE REALTIME FOR TABLES (idempotent: skip if already member)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'topics') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.topics;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;

-- 10. GRANTS FOR AUTHENTICATED AND ANON ROLES
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

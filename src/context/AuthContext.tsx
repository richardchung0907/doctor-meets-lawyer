import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile, ProfessionKey } from '../types/database';
import {
  addPremiumListener,
  fetchPremiumStatus,
  syncPurchasesIdentity,
} from '../lib/purchases';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isPremium: boolean;
  isLoading: boolean;
  selectedOnboardingProfession: ProfessionKey | null;
  setSelectedOnboardingProfession: (prof: ProfessionKey | null) => void;
  signUpWithProfession: (
    email: string,
    password: string,
    profession: ProfessionKey,
    username: string,
    gender?: string,
    age?: number,
    bio?: string
  ) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshPremiumStatus: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedOnboardingProfession, setSelectedOnboardingProfession] = useState<ProfessionKey | null>(null);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) {
        const p = data as Profile;
        setProfile(p);
        // 权威来源（rc-webhook 落库）；到期时间已过则视为非会员
        const stillValid =
          !!p.is_premium &&
          (!p.premium_expires_at || new Date(p.premium_expires_at).getTime() > Date.now());
        setIsPremium(stillValid);
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
    }
  };

  useEffect(() => {
    // 1. Fetch current session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      if (initialSession?.user) {
        fetchProfile(initialSession.user.id);
      }
      setIsLoading(false);
    });

    // 2. Listen to Auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        await fetchProfile(currentSession.user.id);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 3. 购买身份同步：登录 → logIn(supabaseUid)，登出 → logOut
  useEffect(() => {
    if (isLoading) return;
    const userId = session?.user?.id ?? null;

    if (userId) {
      syncPurchasesIdentity(userId);
      fetchPremiumStatus().then((ok) => {
        if (ok) setIsPremium(true);
      });
    } else {
      syncPurchasesIdentity(null);
      setIsPremium(false);
    }
  }, [session?.user?.id, isLoading]);

  // 4. 权益变化实时监听（购买/恢复/到期的即时 UI 反馈；权威仍以 profiles.is_premium 为准）
  useEffect(() => {
    const unsubscribe = addPremiumListener((active) => {
      if (active) setIsPremium(true);
    });
    return () => unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  };

  /** 购买/恢复成功后刷新会员状态：SDK 即时值 + webhook 落库后的权威值 */
  const refreshPremiumStatus = async (): Promise<boolean> => {
    const sdkActive = await fetchPremiumStatus();
    await refreshProfile();
    return sdkActive;
  };

  const signUpWithProfession = async (
    email: string,
    password: string,
    profession: ProfessionKey,
    username: string,
    gender?: string,
    age?: number,
    bio?: string
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          profession,
          username,
          gender: gender || 'other',
          age: age || null,
          bio: bio || '',
        },
      },
    });

    if (!error && data.user) {
      // Profile trigger runs in Postgres automatically
      await fetchProfile(data.user.id);
    }
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!error && data.user) {
      await fetchProfile(data.user.id);
    }
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
    setIsPremium(false);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        isPremium,
        isLoading,
        selectedOnboardingProfession,
        setSelectedOnboardingProfession,
        signUpWithProfession,
        signIn,
        signOut,
        refreshProfile,
        refreshPremiumStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

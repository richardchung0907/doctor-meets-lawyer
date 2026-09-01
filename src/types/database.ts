export type ProfessionKey = 
  | 'medical_doctor'
  | 'tcm'
  | 'dentist'
  | 'veterinarian'
  | 'lawyer'
  | 'judge'
  | 'other';

export interface Profile {
  id: string;
  username: string | null;
  profession: ProfessionKey;
  gender?: string | null;
  age?: number | null;
  avatar_url?: string | null;
  bio?: string | null;
  created_at: string;
  updated_at?: string;
  last_seen?: string | null;
  is_premium?: boolean;
  premium_expires_at?: string | null;
  verification_status?: string; // 'unverified' | 'pending' | 'verified'
}

export interface VerificationRequest {
  id: string;
  user_id: string;
  profession: ProfessionKey;
  doc_path: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_note?: string | null;
  created_at: string;
  reviewed_at?: string | null;
}

export interface Topic {
  id: string;
  user_id: string;
  content: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  profiles?: Profile;
}

export interface Conversation {
  id: string;
  participant1_id: string;
  participant2_id: string;
  topic_id?: string | null;
  created_at: string;
  updated_at: string;
  other_participant?: Profile;
  last_message?: Message | null;
  unread_count?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  sender_profile?: Profile;
}

export const PROFESSION_KEYS: ProfessionKey[] = [
  'medical_doctor',
  'tcm',
  'dentist',
  'veterinarian',
  'lawyer',
  'judge',
  'other'
];

export const PROFESSION_ICONS: Record<ProfessionKey, string> = {
  medical_doctor: 'Stethoscope',
  tcm: 'Leaf',
  dentist: 'Smile',
  veterinarian: 'Dog',
  lawyer: 'Briefcase',
  judge: 'Scale',
  other: 'UserCheck'
};

export const PROFESSION_COLORS: Record<ProfessionKey, { primary: string; bg: string; border: string }> = {
  medical_doctor: { primary: '#0EA5E9', bg: 'rgba(14, 165, 233, 0.12)', border: '#38BDF8' },
  tcm: { primary: '#10B981', bg: 'rgba(16, 185, 129, 0.12)', border: '#34D399' },
  dentist: { primary: '#06B6D4', bg: 'rgba(6, 182, 212, 0.12)', border: '#22D3EE' },
  veterinarian: { primary: '#F59E0B', bg: 'rgba(245, 158, 11, 0.12)', border: '#FBBF24' },
  lawyer: { primary: '#6366F1', bg: 'rgba(99, 102, 241, 0.12)', border: '#818CF8' },
  judge: { primary: '#8B5CF6', bg: 'rgba(139, 92, 246, 0.12)', border: '#A78BFA' },
  other: { primary: '#64748B', bg: 'rgba(100, 116, 139, 0.12)', border: '#94A3B8' }
};



export interface FounderDetail {
  id: string;
  name: string;
  email: string;
  company: string | null;
  companyDomain: string | null;
  role: string | null;
  phone: string | null;
  linkedin: string | null;
  twitter: string | null;
  website: string | null;
  authProvider: string;
  googleId: string | null;
  emailVerified: boolean;
  status: string;
  deactivatedAt: string | null;
  onboardingCompleted: boolean;
  onboardingStep: number;
  avatar: string | null;
  bio: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  updatedAt: string;
  startups: Array<{
    id: string;
    name: string;
    slug: string;
    tagline: string;
    status: string;
    createdAt: string;
  }>;
  tools: Array<{
    id: string;
    name: string;
    slug: string;
    tagline: string;
    status: string;
    createdAt: string;
  }>;
}

/** A confirmation the page should ask for before running an action. */
export interface ConfirmRequest {
  title: string;
  message: string;
  variant: 'danger' | 'warning';
  confirmLabel: string;
  requireTyping: boolean;
  onConfirm: () => void;
}

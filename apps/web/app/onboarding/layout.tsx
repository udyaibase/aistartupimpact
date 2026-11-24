import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Welcome to Udyaibase',
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  // The page draws its own header (it shows the step and Skip), so the layout is only the background.
  return <div className="min-h-[100dvh] bg-[#F7F7F8] dark:bg-gray-950 font-jakarta">{children}</div>;
}

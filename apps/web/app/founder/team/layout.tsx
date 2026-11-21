/** This screen is a client component, which can't set its own browser-tab title. */
export const metadata = { title: 'Team' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

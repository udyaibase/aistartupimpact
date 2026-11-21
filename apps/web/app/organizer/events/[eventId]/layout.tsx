export const metadata = { title: { default: 'Edit event', template: '%s | Udyaibase' } };

/** Only here to name the browser tab: the page itself is a client component and can't. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

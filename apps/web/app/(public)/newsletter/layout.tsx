import type { Metadata } from 'next';

// The newsletter page is a client component, so its metadata lives here. Without it the page inherited the
// homepage's title, description and canonical, and Google treated it as a duplicate of the homepage.
const title = "Free Weekly AI Newsletter — India's AI Startups, Funding & Tools";
const description =
  "A free weekly digest of India's AI ecosystem: new funding rounds, startup launches, AI tools worth trying and AI jobs. One email a week, unsubscribe anytime.";

export const metadata: Metadata = {
  title: { absolute: `${title} | Udyaibase` },
  description,
  alternates: { canonical: '/newsletter' },
  openGraph: { title, description, url: 'https://udyaibase.com/newsletter', type: 'website', images: [{ url: '/og-image.webp', width: 2250, height: 1181 }] },
  twitter: { card: 'summary_large_image', title, description, images: ['/og-image.webp'] },
};

export default function NewsletterLayout({ children }: { children: React.ReactNode }) {
  return children;
}

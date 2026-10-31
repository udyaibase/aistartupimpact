import { jsonLd as jsonLdHtml } from "@/lib/json-ld";
import Link from 'next/link';
import { Metadata } from 'next';
import { Clock, Calendar, User, Newspaper, BookOpen, Twitter, Linkedin, Globe } from 'lucide-react';
import { generatePersonSchema } from '@/lib/seo';

const author = {
  name: 'Priya Sharma',
  slug: 'priya-sharma',
  role: 'Senior AI Reporter',
  bio: 'Covering India\'s AI ecosystem since 2019. Previously at YourStory and Inc42. IITM alum.',
  twitter: 'https://twitter.com/priyasharma',
  linkedin: '#',
  website: '#',
  articles: 142,
  followers: '8.2K',
};

const articles = [
  { slug: 'india-ai-policy', title: "India's New AI Policy Framework: What Every Startup Founder Must Know", category: 'Policy', date: 'Mar 4, 2025', readTime: '6 min' },
  { slug: 'ai-regulation-global', title: 'AI Regulation Landscape 2025: How India Compares to EU, US, and China', category: 'Policy', date: 'Mar 1, 2025', readTime: '10 min' },
  { slug: 'women-in-ai-india', title: 'Women in AI: 20 Indian Leaders Shaping the Future of Technology', category: 'Feature', date: 'Feb 26, 2025', readTime: '12 min' },
  { slug: 'ai-ethics-india', title: 'The Ethics Question: Should India Regulate AI Before It\'s Too Late?', category: 'Opinion', date: 'Feb 20, 2025', readTime: '8 min' },
  { slug: 'deeptech-india', title: 'India\'s Deep Tech Moment: Why Now Is the Time for AI Infrastructure', category: 'Analysis', date: 'Feb 15, 2025', readTime: '9 min' },
  { slug: 'nasscom-ai-summit', title: 'NASSCOM AI Summit 2025: Key Takeaways for Indian Startups', category: 'Events', date: 'Feb 10, 2025', readTime: '7 min' },
];

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  return {
    title: `${author.name} — ${author.role}`,
    description: author.bio,
    alternates: { canonical: `https://udyaibase.com/author/${params.slug}` },
    openGraph: {
      title: `${author.name} — ${author.role}`,
      description: author.bio,
      type: 'profile',
      url: `https://udyaibase.com/author/${params.slug}`,
      siteName: 'Udyaibase',
    },
    twitter: {
      card: 'summary',
      title: `${author.name} — ${author.role}`,
      description: author.bio,
      creator: '@aikitstartup',
    },
  };
}

export default async function AuthorPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const jsonLd = generatePersonSchema({
    name: author.name,
    slug: params.slug,
    bio: author.bio,
    role: author.role,
    twitter: author.twitter,
    linkedin: author.linkedin,
    website: author.website,
  });
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
      />
      {/* Author Header */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 mb-8 sm:mb-10 text-center sm:text-left">
        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-brand/10 dark:bg-brand/20 flex items-center justify-center text-3xl text-brand font-bold font-sora shrink-0">
          {author.name.charAt(0)}
        </div>
        <div>
          <h1 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white">{author.name}</h1>
          <p className="text-brand font-jakarta font-semibold text-sm mt-1">{author.role}</p>
          <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm mt-2 max-w-md">{author.bio}</p>
          <div className="flex items-center justify-center sm:justify-start gap-4 mt-4">
            <div className="text-center">
              <div className="font-sora font-extrabold text-lg text-navy dark:text-white">{author.articles}</div>
              <div className="text-xs text-gray-400 font-jakarta">Articles</div>
            </div>
            <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
            <div className="text-center">
              <div className="font-sora font-extrabold text-lg text-navy dark:text-white">{author.followers}</div>
              <div className="text-xs text-gray-400 font-jakarta">Followers</div>
            </div>
            <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-2">
              {[Twitter, Linkedin, Globe].map((Icon, i) => (
                <a key={i} href="#" className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-brand/10 dark:hover:bg-brand/20 flex items-center justify-center transition-colors">
                  <Icon className="w-4 h-4 text-gray-400 hover:text-brand" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Articles */}
      <h2 className="section-title mb-6">Articles by {author.name.split(' ')[0]}</h2>
      <div className="space-y-4">
        {articles.map((a) => (
          <Link key={a.slug} href={`/news/${a.slug}`} className="group block">
            <div className="card p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="badge-category text-xs">{a.category}</span>
              </div>
              <h3 className="font-sora font-bold text-[15px] sm:text-base text-navy dark:text-white group-hover:text-brand transition-colors leading-snug">{a.title}</h3>
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-400 dark:text-gray-500 font-jakarta">
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{a.date}</span>
                <span>·</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{a.readTime}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

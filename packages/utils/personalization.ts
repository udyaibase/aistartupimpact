/**
 * What website users tell us in onboarding, and how each answer maps onto the site's content. Pure data and
 * helpers (no server imports): used by onboarding, Settings → Preferences and the "For you" recommendations.
 *
 * Topics are industry- and theme-based so one choice personalises news, startups, tools and jobs together.
 */

export type IntentValue =
  | 'reading_news' | 'exploring_tools' | 'looking_for_jobs' | 'following_startups'
  | 'attending_events' | 'investor_vc' | 'founder_builder' | 'learning_ai';

export const INTENTS: { value: IntentValue; label: string; description: string }[] = [
  { value: 'reading_news', label: 'AI news and stories', description: 'What’s happening in Indian AI, every day' },
  { value: 'exploring_tools', label: 'AI tools', description: 'Discover and compare tools for your work' },
  { value: 'looking_for_jobs', label: 'Jobs and internships', description: 'Roles at AI startups and companies' },
  { value: 'following_startups', label: 'Startups and funding', description: 'Track startups, founders and funding rounds' },
  { value: 'attending_events', label: 'Events and meetups', description: 'Hackathons, talks and meetups near you' },
  { value: 'learning_ai', label: 'Learning AI', description: 'Skills, courses and explainers' },
  { value: 'investor_vc', label: 'Investing', description: 'Research startups and deals' },
  { value: 'founder_builder', label: 'Building a startup', description: 'Ideas, tools and people for founders' },
];
export const MAX_INTENTS = 3;
export const isIntent = (v: unknown): v is IntentValue => INTENTS.some((i) => i.value === v);

export interface Topic {
  id: string;
  label: string;
  group: 'AI and technology' | 'Industries' | 'Founders and careers';
  /** Lowercase words matched against a startup's category (free text, e.g. "HealthTech & BioTech"). */
  startup: string[];
  /** Tool category names (ToolCategory.name) this topic covers. */
  tools: string[];
  /** Job categories (JobBoardCategory) this topic covers. */
  jobs: string[];
  /** Lowercase words matched against news titles and summaries. */
  news: string[];
}

export const TOPICS: Topic[] = [
  // AI and technology
  { id: 'genai', label: 'Generative AI and LLMs', group: 'AI and technology', startup: ['ai infrastructure', 'enterprise software'], tools: ['Writing', 'Video', 'Voice', 'Design'], jobs: ['LLM_ENGINEER', 'PROMPT_ENGINEER', 'NLP_ENGINEER', 'AI_ENGINEER'], news: ['genai', 'generative', 'llm', 'gpt', 'gemini', 'claude', 'language model', 'chatbot'] },
  { id: 'agents', label: 'AI agents and automation', group: 'AI and technology', startup: ['enterprise software', 'saas'], tools: ['Productivity', 'Customer Support'], jobs: ['AI_ENGINEER', 'LLM_ENGINEER', 'AI_SOLUTIONS_ARCHITECT'], news: ['agent', 'agentic', 'automation', 'copilot', 'workflow'] },
  { id: 'devtools', label: 'Developer tools', group: 'AI and technology', startup: ['developer tools', 'devops'], tools: ['Coding'], jobs: ['SOFTWARE_ENGINEER', 'BACKEND_ENGINEER', 'FULL_STACK_ENGINEER', 'DEVOPS_ENGINEER'], news: ['developer', 'coding', 'code', 'open source', 'github'] },
  { id: 'infra', label: 'AI infrastructure and compute', group: 'AI and technology', startup: ['ai infrastructure', 'mlops', 'telecom'], tools: ['Coding', 'Data'], jobs: ['AI_INFRASTRUCTURE', 'ML_ENGINEER', 'DEVOPS_ENGINEER'], news: ['gpu', 'compute', 'data centre', 'data center', 'semiconductor', 'chip', 'cloud', 'mlops'] },
  { id: 'data', label: 'Data and analytics', group: 'AI and technology', startup: ['data', 'analytics'], tools: ['Data'], jobs: ['DATA_SCIENTIST', 'DATA_ENGINEER', 'DATA_ANALYST', 'BUSINESS_ANALYST'], news: ['data', 'analytics', 'dashboard'] },
  { id: 'vision', label: 'Computer vision', group: 'AI and technology', startup: ['deeptech', 'robotics', 'manufacturing'], tools: ['Design', 'Video'], jobs: ['COMPUTER_VISION', 'ML_ENGINEER'], news: ['computer vision', 'image', 'camera', 'drone', 'satellite imagery'] },
  { id: 'robotics', label: 'Robotics and hardware', group: 'AI and technology', startup: ['robotics', 'deeptech', 'hardware', 'industrial automation'], tools: [], jobs: ['ROBOTICS_ENGINEER', 'COMPUTER_VISION'], news: ['robot', 'robotics', 'hardware', 'drone'] },
  { id: 'security', label: 'Cybersecurity', group: 'AI and technology', startup: ['cybersecurity', 'security'], tools: [], jobs: ['SECURITY_ENGINEER'], news: ['security', 'cyber', 'fraud', 'deepfake', 'privacy'] },
  { id: 'web3', label: 'Blockchain and Web3', group: 'AI and technology', startup: ['blockchain', 'web3', 'crypto'], tools: [], jobs: [], news: ['blockchain', 'web3', 'crypto'] },
  { id: 'space', label: 'SpaceTech', group: 'AI and technology', startup: ['spacetech', 'space'], tools: [], jobs: [], news: ['space', 'satellite', 'isro'] },
  { id: 'voice', label: 'Voice and Indian languages', group: 'AI and technology', startup: ['consumer apps', 'media'], tools: ['Voice', 'Writing'], jobs: ['NLP_ENGINEER'], news: ['voice', 'speech', 'indic', 'indian language', 'bhashini', 'translation', 'multilingual'] },

  // Industries
  { id: 'fintech', label: 'FinTech', group: 'Industries', startup: ['fintech', 'finance'], tools: ['Data'], jobs: ['FINANCE'], news: ['fintech', 'payment', 'upi', 'bank', 'lending', 'credit'] },
  { id: 'insurtech', label: 'InsurTech', group: 'Industries', startup: ['insurtech', 'insurance'], tools: [], jobs: [], news: ['insurance', 'insurtech'] },
  { id: 'health', label: 'HealthTech', group: 'Industries', startup: ['health', 'medtech', 'biotech'], tools: [], jobs: [], news: ['health', 'medical', 'hospital', 'diagnos', 'patient'] },
  { id: 'pharma', label: 'Pharma and life sciences', group: 'Industries', startup: ['pharma', 'life sciences', 'biotech'], tools: [], jobs: [], news: ['pharma', 'drug', 'biotech', 'genom'] },
  { id: 'edtech', label: 'EdTech', group: 'Industries', startup: ['edtech', 'education'], tools: ['Writing'], jobs: [], news: ['education', 'edtech', 'student', 'school', 'learning'] },
  { id: 'agritech', label: 'AgriTech', group: 'Industries', startup: ['agritech', 'agri'], tools: [], jobs: [], news: ['agri', 'farm', 'crop', 'farmer'] },
  { id: 'climate', label: 'Climate and clean energy', group: 'Industries', startup: ['cleantech', 'climate', 'energy', 'sustainab'], tools: [], jobs: [], news: ['climate', 'energy', 'solar', 'carbon', 'ev ', 'electric vehicle', 'sustainab'] },
  { id: 'mobility', label: 'Mobility and logistics', group: 'Industries', startup: ['mobility', 'logistics', 'transport', 'supply chain'], tools: [], jobs: [], news: ['logistics', 'mobility', 'transport', 'delivery', 'supply chain'] },
  { id: 'retail', label: 'E-commerce and retail', group: 'Industries', startup: ['e-commerce', 'retail', 'd2c', 'commerce'], tools: ['Customer Support'], jobs: [], news: ['ecommerce', 'e-commerce', 'retail', 'd2c', 'shopping'] },
  { id: 'food', label: 'FoodTech', group: 'Industries', startup: ['foodtech', 'food'], tools: [], jobs: [], news: ['food', 'restaurant', 'grocery'] },
  { id: 'media', label: 'Media, creators and entertainment', group: 'Industries', startup: ['media', 'entertainment', 'gaming'], tools: ['Video', 'Design', 'Writing', 'Voice'], jobs: ['AI_DESIGNER', 'CONTENT_WRITING'], news: ['media', 'creator', 'film', 'music', 'gaming', 'content'] },
  { id: 'marketing', label: 'Marketing and AdTech', group: 'Industries', startup: ['martech', 'adtech', 'marketing'], tools: ['Writing', 'Design'], jobs: ['AI_MARKETING'], news: ['marketing', 'advertis', 'brand'] },
  { id: 'hr', label: 'HR and future of work', group: 'Industries', startup: ['hrtech', 'hr tech', 'hr '], tools: ['Productivity'], jobs: ['HR_RECRUITING'], news: ['hiring', 'jobs', 'workforce', 'layoff', 'talent'] },
  { id: 'legal', label: 'LegalTech', group: 'Industries', startup: ['legaltech', 'legal'], tools: ['Writing'], jobs: ['LEGAL'], news: ['legal', 'law', 'court'] },
  { id: 'realestate', label: 'Real estate and construction', group: 'Industries', startup: ['proptech', 'real estate', 'construction'], tools: [], jobs: [], news: ['real estate', 'property', 'construction'] },
  { id: 'manufacturing', label: 'Manufacturing and Industry 4.0', group: 'Industries', startup: ['manufacturing', 'industry 4.0', 'industrial'], tools: [], jobs: [], news: ['manufactur', 'factory', 'industrial'] },
  { id: 'travel', label: 'Travel and hospitality', group: 'Industries', startup: ['travel', 'hospitality'], tools: [], jobs: [], news: ['travel', 'hotel', 'tourism'] },
  { id: 'gov', label: 'GovTech, defence and public sector', group: 'Industries', startup: ['govtech', 'defense', 'defence', 'public'], tools: [], jobs: ['AI_ETHICS'], news: ['government', 'ministry', 'policy', 'india ai mission', 'defence', 'defense', 'public sector'] },
  { id: 'saas', label: 'Enterprise SaaS', group: 'Industries', startup: ['enterprise software', 'saas'], tools: ['Productivity', 'Customer Support', 'Data'], jobs: ['AI_SOLUTIONS_ARCHITECT'], news: ['saas', 'enterprise', 'b2b'] },
  { id: 'consumer', label: 'Consumer apps', group: 'Industries', startup: ['consumer', 'social'], tools: ['Productivity'], jobs: ['MOBILE_ENGINEER'], news: ['consumer', 'app', 'social'] },
  { id: 'impact', label: 'Social impact', group: 'Industries', startup: ['social impact', 'impact', 'ngo'], tools: [], jobs: [], news: ['social impact', 'rural', 'inclusion', 'accessib', 'nonprofit'] },

  // Founders and careers
  { id: 'funding', label: 'Funding and investors', group: 'Founders and careers', startup: [], tools: [], jobs: [], news: ['funding', 'raises', 'series a', 'series b', 'seed', 'investor', 'vc ', 'valuation', 'ipo', 'acquisition'] },
  { id: 'founders', label: 'Founder stories', group: 'Founders and careers', startup: [], tools: [], jobs: [], news: ['founder', 'journey', 'started', 'bootstrap'] },
  { id: 'product', label: 'Product and design', group: 'Founders and careers', startup: [], tools: ['Design'], jobs: ['AI_PRODUCT_MANAGER', 'AI_DESIGNER'], news: ['product', 'design', 'ux'] },
  { id: 'careers', label: 'AI careers and skills', group: 'Founders and careers', startup: [], tools: ['Coding', 'Data'], jobs: [], news: ['career', 'skill', 'course', 'upskill', 'internship', 'fresher'] },
  { id: 'research', label: 'Research, ethics and policy', group: 'Founders and careers', startup: [], tools: [], jobs: ['AI_RESEARCH_SCIENTIST', 'AI_ETHICS'], news: ['research', 'paper', 'iit', 'iisc', 'ethic', 'regulation', 'policy', 'dpdp'] },
];
export const TOPIC_GROUPS = ['AI and technology', 'Industries', 'Founders and careers'] as const;
export const MAX_TOPICS = 12;
const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]));
export const topicById = (id: string) => TOPIC_BY_ID.get(id);
/** Known topic ids only, de-duplicated, capped. */
export const cleanTopics = (raw: unknown): string[] =>
  [...new Set((Array.isArray(raw) ? raw : []).filter((t): t is string => typeof t === 'string' && TOPIC_BY_ID.has(t)))].slice(0, MAX_TOPICS);

/** The topic a startup category belongs to (first match), for "Because you follow …". */
export function topicForStartupCategory(category: string | null | undefined, topics: string[]): Topic | undefined {
  const c = (category ?? '').toLowerCase();
  if (!c) return undefined;
  return topics.map(topicById).find((t) => t && t.startup.some((w) => c.includes(w)));
}
export function topicForText(text: string | null | undefined, topics: string[]): Topic | undefined {
  const s = ` ${(text ?? '').toLowerCase()} `;
  return topics.map(topicById).find((t) => t && t.news.some((w) => s.includes(w)));
}

/* ------------------------------------------------------------------ how they found us */

export const REFERRAL_SOURCES = [
  { value: 'google', label: 'Google search' },
  { value: 'ai_assistant', label: 'ChatGPT or another AI assistant' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'x', label: 'X (Twitter)' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'whatsapp', label: 'WhatsApp or Telegram group' },
  { value: 'friend', label: 'Friend or colleague' },
  { value: 'college', label: 'College or university' },
  { value: 'news', label: 'News article or blog' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'event', label: 'Event, hackathon or meetup' },
  { value: 'job_post', label: 'A job post' },
  { value: 'other', label: 'Somewhere else' },
] as const;
export const isReferralSource = (v: unknown): v is (typeof REFERRAL_SOURCES)[number]['value'] => REFERRAL_SOURCES.some((r) => r.value === v);

/* ------------------------------------------------------------------ job preferences */

export const EXPERIENCE_LEVELS = [
  { value: 'student', label: 'Student or intern', min: 0, max: 0 },
  { value: 'fresher', label: 'Fresher (0–1 yrs)', min: 0, max: 1 },
  { value: 'junior', label: '1–3 years', min: 1, max: 3 },
  { value: 'mid', label: '3–6 years', min: 3, max: 6 },
  { value: 'senior', label: '6–10 years', min: 6, max: 10 },
  { value: 'lead', label: '10+ years', min: 10, max: 40 },
] as const;
export const WORK_MODES = [
  { value: 'REMOTE', label: 'Remote' },
  { value: 'HYBRID', label: 'Hybrid' },
  { value: 'ONSITE', label: 'In office' },
] as const;
export const MAX_JOB_ROLES = 3;

export interface JobPrefs { roles: string[]; experience: string | null; workModes: string[] }

export function cleanJobPrefs(raw: unknown, validRoles: readonly string[]): JobPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return {
    roles: [...new Set(list(r.roles).filter((x) => validRoles.includes(x)))].slice(0, MAX_JOB_ROLES),
    experience: EXPERIENCE_LEVELS.some((e) => e.value === r.experience) ? (r.experience as string) : null,
    workModes: [...new Set(list(r.workModes).filter((x) => WORK_MODES.some((w) => w.value === x)))],
  };
}

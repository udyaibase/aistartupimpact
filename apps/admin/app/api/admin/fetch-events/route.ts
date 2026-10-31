import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import * as cheerio from 'cheerio';
import { withPublicRefresh } from '@/lib/refresh-public';

export const maxDuration = 120;

// ─── Source definitions ────────────────────────────────────────────────

interface EventSource {
  name: string;
  fetchEvents: () => Promise<RawEvent[]>;
}

interface RawEvent {
  title: string;
  url: string;
  date: string | null;
  endDate?: string | null;
  location: string | null;
  description: string | null;
  category: string | null;
  format: string | null;
  source: string;
  imageUrl?: string | null;
  organizer?: string | null;
}

// ─── Relevance scoring ─────────────────────────────────────────────────

const AI_KEYWORDS = [
  'artificial intelligence', 'machine learning', 'deep learning', 'neural network',
  'llm', 'large language model', 'generative ai', 'gen ai', 'genai',
  'computer vision', 'nlp', 'natural language', 'reinforcement learning',
  'transformer', 'diffusion model', 'foundation model', 'rag',
  'ai agent', 'ai agents', 'agentic', 'multimodal',
  'chatgpt', 'openai', 'anthropic', 'claude', 'gemini', 'llama',
  'stable diffusion', 'midjourney', 'hugging face',
  'mlops', 'ml engineer', 'ai engineer', 'data science',
  'prompt engineering', 'fine-tuning', 'embeddings', 'vector database',
  'responsible ai', 'ai safety', 'ai ethics', 'ai governance',
  'ai startup', 'ai product', 'ai infrastructure',
];

const TECH_KEYWORDS = [
  'hackathon', 'hack', 'devfest', 'developer', 'coding',
  'startup', 'founder', 'entrepreneur', 'pitch', 'demo day',
  'saas', 'cloud', 'devops', 'kubernetes', 'blockchain', 'web3',
  'cybersecurity', 'fintech', 'healthtech', 'edtech', 'deeptech',
  'open source', 'api', 'sdk', 'react', 'python', 'rust',
  'robotics', 'iot', 'automation', 'quantum computing',
];

const INDIA_KEYWORDS = [
  'india', 'bangalore', 'bengaluru', 'mumbai', 'delhi', 'hyderabad',
  'chennai', 'pune', 'kolkata', 'gurgaon', 'gurugram', 'noida',
  'kochi', 'ahmedabad', 'jaipur', 'chandigarh', 'indore',
  'iit', 'iisc', 'nasscom', 'niti aayog', 'meity',
];

function scoreRelevance(event: RawEvent): number {
  const text = `${event.title} ${event.description || ''} ${event.location || ''} ${event.category || ''}`.toLowerCase();
  let score = 0;

  // AI keywords (highest weight)
  for (const kw of AI_KEYWORDS) {
    if (text.includes(kw)) score += 10;
  }

  // Tech/hackathon keywords
  for (const kw of TECH_KEYWORDS) {
    if (text.includes(kw)) score += 5;
  }

  // India relevance bonus
  for (const kw of INDIA_KEYWORDS) {
    if (text.includes(kw)) score += 3;
  }

  // Category bonuses
  if (event.category) {
    const cat = event.category.toLowerCase();
    if (cat.includes('hackathon')) score += 15;
    if (cat.includes('ai') || cat.includes('ml')) score += 15;
    if (cat.includes('conference') || cat.includes('summit')) score += 5;
  }

  // Penalize clearly irrelevant
  const irrelevant = ['music', 'concert', 'wedding', 'fashion show', 'cooking class', 'yoga', 'marathon', 'cricket'];
  for (const kw of irrelevant) {
    if (text.includes(kw)) score -= 20;
  }

  // Future event bonus (past events score 0)
  if (event.date) {
    try {
      const d = new Date(event.date);
      if (d > new Date()) score += 5;
      else score = Math.max(0, score - 10);
    } catch {}
  }

  return Math.max(0, score);
}

function classifyCategory(event: RawEvent): string {
  const text = `${event.title} ${event.description || ''} ${event.category || ''}`.toLowerCase();
  if (text.includes('hackathon') || text.includes('hack')) return 'HACKATHON';
  if (text.includes('summit')) return 'SUMMIT';
  if (text.includes('workshop') || text.includes('bootcamp') || text.includes('hands-on')) return 'WORKSHOP';
  if (text.includes('meetup') || text.includes('meet-up') || text.includes('community')) return 'MEETUP';
  if (text.includes('webinar') || text.includes('online session')) return 'WEBINAR';
  if (text.includes('demo day') || text.includes('pitch')) return 'DEMO_DAY';
  if (text.includes('networking') || text.includes('mixer')) return 'NETWORKING';
  return 'CONFERENCE';
}

function classifyFormat(event: RawEvent): string {
  const text = `${event.title} ${event.description || ''} ${event.location || ''} ${event.format || ''}`.toLowerCase();
  if (text.includes('virtual') || text.includes('online') || text.includes('remote') || text.includes('webinar')) return 'VIRTUAL';
  if (text.includes('hybrid')) return 'HYBRID';
  return 'IN_PERSON';
}

// ─── Source: Luma (lu.ma) ──────────────────────────────────────────────

async function fetchLumaEvents(): Promise<RawEvent[]> {
  const events: RawEvent[] = [];
  const queries = ['AI India', 'Machine Learning India', 'hackathon India tech', 'GenAI Bangalore', 'AI Mumbai'];

  for (const query of queries) {
    try {
      const res = await fetch(`https://api.lu.ma/discover/get-paginated?query=${encodeURIComponent(query)}&pagination_limit=20`, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Udyaibase-EventBot/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const entries = data?.entries || [];
      for (const entry of entries) {
        const evt = entry?.event;
        if (!evt) continue;
        events.push({
          title: evt.name || '',
          url: `https://lu.ma/${evt.url || evt.api_id}`,
          date: evt.start_at || null,
          endDate: evt.end_at || null,
          location: evt.geo_address_json?.full_address || evt.geo_address_info?.city || null,
          description: evt.description_md || evt.description || null,
          category: null,
          format: evt.meeting_url ? 'VIRTUAL' : 'IN_PERSON',
          source: 'luma',
          imageUrl: sanitizeImageUrl(evt.cover_url),
          organizer: entry?.calendar?.name || null,
        });
      }
    } catch {}
  }
  return events;
}

// ─── Source: Eventbrite ─────────────────────────────────────────────────

async function fetchEventbriteEvents(): Promise<RawEvent[]> {
  const events: RawEvent[] = [];
  const searchUrls = [
    'https://www.eventbrite.com/d/india/artificial-intelligence/',
    'https://www.eventbrite.com/d/india/hackathon/',
    'https://www.eventbrite.com/d/india/machine-learning/',
    'https://www.eventbrite.com/d/india/tech-conference/',
  ];

  for (const searchUrl of searchUrls) {
    try {
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);

      // Eventbrite embeds event data in script tags
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const jsonData = JSON.parse($(el).html() || '');
          const items = Array.isArray(jsonData) ? jsonData : [jsonData];
          for (const item of items) {
            if (item['@type'] !== 'Event') continue;
            events.push({
              title: item.name || '',
              url: item.url || '',
              date: item.startDate || null,
              endDate: item.endDate || null,
              location: item.location?.name || item.location?.address?.addressLocality || null,
              description: item.description || null,
              category: null,
              format: item.eventAttendanceMode?.includes('Online') ? 'VIRTUAL'
                : item.eventAttendanceMode?.includes('Mixed') ? 'HYBRID' : 'IN_PERSON',
              source: 'eventbrite',
              imageUrl: extractImageUrl(item.image),
              organizer: item.organizer?.name || null,
            });
          }
        } catch {}
      });
    } catch {}
  }
  return events;
}

// ─── Source: Meetup.com ─────────────────────────────────────────────────

async function fetchMeetupEvents(): Promise<RawEvent[]> {
  const events: RawEvent[] = [];
  const searchPages = [
    'https://www.meetup.com/find/?keywords=artificial+intelligence&location=in--India',
    'https://www.meetup.com/find/?keywords=machine+learning&location=in--India',
    'https://www.meetup.com/find/?keywords=hackathon&location=in--India',
  ];

  for (const pageUrl of searchPages) {
    try {
      const res = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);

      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const jsonData = JSON.parse($(el).html() || '');
          const items = Array.isArray(jsonData) ? jsonData : [jsonData];
          for (const item of items) {
            if (item['@type'] !== 'Event') continue;
            events.push({
              title: item.name || '',
              url: item.url || '',
              date: item.startDate || null,
              endDate: item.endDate || null,
              location: item.location?.name || item.location?.address?.addressLocality || null,
              description: item.description || null,
              category: null,
              format: item.eventAttendanceMode?.includes('Online') ? 'VIRTUAL' : 'IN_PERSON',
              source: 'meetup',
              imageUrl: extractImageUrl(item.image),
              organizer: item.organizer?.name || null,
            });
          }
        } catch {}
      });
    } catch {}
  }
  return events;
}

// ─── Source: Devfolio (hackathons) ──────────────────────────────────────

async function fetchDevfolioEvents(): Promise<RawEvent[]> {
  const events: RawEvent[] = [];
  try {
    const res = await fetch('https://api.devfolio.co/api/search/hackathons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Udyaibase-EventBot/1.0' },
      body: JSON.stringify({
        type: 'application_open',
        from: 0,
        size: 30,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = await res.json();
      const hits = data?.hits?.hits || [];
      for (const hit of hits) {
        const h = hit._source;
        if (!h) continue;
        events.push({
          title: h.name || '',
          url: `https://${h.slug || h.hackathon_setting?.slug || ''}.devfolio.co/`,
          date: h.starts_at || null,
          endDate: h.ends_at || null,
          location: h.is_online ? 'Online' : (h.city || null),
          description: h.desc || h.tagline || null,
          category: 'HACKATHON',
          format: h.is_online ? 'VIRTUAL' : 'IN_PERSON',
          source: 'devfolio',
          imageUrl: sanitizeImageUrl(h.cover_img),
          organizer: h.org_name || null,
        });
      }
    }
  } catch {}
  return events;
}

// ─── Source: Unstop (formerly D2C / Dare2Compete) ──────────────────────

async function fetchUnstopEvents(): Promise<RawEvent[]> {
  const events: RawEvent[] = [];
  try {
    const res = await fetch('https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&per_page=20&oppstatus=open&quickFilter=ai', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Udyaibase-EventBot/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const data = await res.json();
      const items = data?.data?.data || [];
      for (const item of items) {
        events.push({
          title: item.title || '',
          url: `https://unstop.com${item.public_url || `/hackathons/${item.id}`}`,
          date: item.start_date || null,
          endDate: item.end_date || null,
          location: item.festival?.city?.name || (item.type === 'online' ? 'Online' : null),
          description: item.seo_details?.seo_description || item.details?.short_desc || null,
          category: 'HACKATHON',
          format: item.type === 'online' ? 'VIRTUAL' : 'IN_PERSON',
          source: 'unstop',
          imageUrl: sanitizeImageUrl(item.banner_mobile?.image_url || item.banner?.image_url),
          organizer: item.organisation?.name || null,
        });
      }
    }
  } catch {}
  return events;
}

// ─── Image URL validation ──────────────────────────────────────────────

function extractImageUrl(image: unknown): string | null {
  if (!image) return null;
  if (typeof image === 'string') return sanitizeImageUrl(image);
  if (Array.isArray(image)) return extractImageUrl(image[0]);
  if (typeof image === 'object' && image !== null) {
    const obj = image as Record<string, unknown>;
    return sanitizeImageUrl((obj.url || obj.contentUrl) as string);
  }
  return null;
}

function sanitizeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:')) return null;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;
  if (/\/fallbacks?\//i.test(trimmed) || /\/placeholder/i.test(trimmed)) return null;
  const upgraded = trimmed.replace(/^http:\/\//, 'https://');
  try {
    new URL(upgraded);
    return upgraded;
  } catch {
    return null;
  }
}

// ─── Deduplication ─────────────────────────────────────────────────────

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
}

function deduplicateEvents(events: RawEvent[]): RawEvent[] {
  const seen = new Map<string, RawEvent>();
  for (const event of events) {
    const key = normalizeTitle(event.title);
    if (!key || key.length < 5) continue;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, event);
    } else {
      // Prefer the one with more info
      const existingLen = (existing.description?.length || 0) + (existing.location?.length || 0);
      const newLen = (event.description?.length || 0) + (event.location?.length || 0);
      if (newLen > existingLen) seen.set(key, event);
    }
  }
  return Array.from(seen.values());
}

// ─── Main handler ──────────────────────────────────────────────────────

async function postHandler(request: NextRequest) {
  const { error } = await requireApiAuth();
  if (error) return NextResponse.json({ success: false, error }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const { sources = ['luma', 'eventbrite', 'meetup', 'devfolio', 'unstop'], minScore = 10 } = body;

    const sourceFetchers: Record<string, () => Promise<RawEvent[]>> = {
      luma: fetchLumaEvents,
      eventbrite: fetchEventbriteEvents,
      meetup: fetchMeetupEvents,
      devfolio: fetchDevfolioEvents,
      unstop: fetchUnstopEvents,
    };

    const selectedSources = sources.filter((s: string) => sourceFetchers[s]);
    const results = await Promise.allSettled(
      selectedSources.map((s: string) => sourceFetchers[s]())
    );

    let allEvents: RawEvent[] = [];
    const sourceStats: Record<string, number> = {};

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const sourceName = selectedSources[i];
      if (result.status === 'fulfilled') {
        sourceStats[sourceName] = result.value.length;
        allEvents.push(...result.value);
      } else {
        sourceStats[sourceName] = 0;
      }
    }

    // Deduplicate
    allEvents = deduplicateEvents(allEvents);

    // Score and classify
    const scored = allEvents.map(event => ({
      ...event,
      relevanceScore: scoreRelevance(event),
      suggestedCategory: classifyCategory(event),
      suggestedFormat: classifyFormat(event),
    }));

    // Filter by minimum score and sort
    const filtered = scored
      .filter(e => e.relevanceScore >= minScore)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    return NextResponse.json({
      success: true,
      data: {
        events: filtered,
        stats: {
          totalScraped: allEvents.length,
          afterScoring: filtered.length,
          bySource: sourceStats,
        },
      },
    });
  } catch (err: any) {
    console.error('[Event Fetcher] Error:', err);
    return NextResponse.json({ success: false, error: err.message || 'Failed to fetch events' }, { status: 500 });
  }
}

export const POST = withPublicRefresh(['events', 'home'], postHandler);

import type { LucideIcon } from 'lucide-react';
import {
  Activity, Award, BarChart3, BellRing, BookOpen, Briefcase, Building, CalendarDays, ClipboardList, Contact, Cpu,
  CreditCard, FileCheck, Inbox, FileText, Flag, Gem, Globe, GraduationCap, Handshake, HeartPulse, Image, IndianRupee,
  Landmark, Layers, LayoutTemplate, LifeBuoy, LineChart, Lock, Mail, Map, MapPin, Megaphone, MessageSquare,
  Newspaper, Package, PencilLine, Quote, Radio, Receipt, Rocket, Settings, Shield, ShieldAlert, ShieldCheck,
  Sparkles, Star, Terminal, UserCog, Users, Wallet, Wrench,
} from 'lucide-react';
import { SECTION_ROLES } from '@/lib/section-access';

/**
 * The admin menu: every section once, in the group where staff look for it, each with its own icon.
 * Who sees an item comes from lib/section-access.ts (never listed here), so the menu, the address check and the
 * actions always agree. `words` are extra terms the search palette matches ("refund" finds Billing).
 */
export interface NavItem { label: string; href: string; icon: LucideIcon; words?: string }
export interface NavGroup { id: string; label: string; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  { id: 'content', label: 'Content', items: [
    { label: 'Articles', href: '/articles', icon: FileText, words: 'news stories posts write editor categories' },
    { label: 'Hero slots', href: '/hero-slots', icon: Layers, words: 'homepage featured cover' },
    { label: 'Tickers', href: '/tickers', icon: Radio, words: 'breaking live strip' },
    { label: 'Media library', href: '/media', icon: Image, words: 'images uploads photos' },
    { label: 'Announcements', href: '/announcements', icon: Megaphone, words: 'banner site notice' },
  ] },
  { id: 'review', label: 'Review', items: [
    { label: 'Event review', href: '/events/review', icon: ShieldCheck, words: 'approve moderation organizer' },
    { label: 'Listing edits', href: '/listing-edits', icon: PencilLine, words: 'founder changes startup tool approve' },
    { label: 'Founder content', href: '/content-review', icon: FileCheck, words: 'stories updates content review' },
    { label: 'Tool reviews', href: '/tool-reviews', icon: MessageSquare, words: 'ratings moderate' },
    { label: 'Startup reviews', href: '/startup-reviews', icon: Star, words: 'ratings moderate' },
    { label: 'Milestones', href: '/milestones', icon: Flag, words: 'founder achievements verify' },
    { label: 'Reports', href: '/reports', icon: ShieldAlert, words: 'flagged abuse scam complaints' },
  ] },
  { id: 'directories', label: 'Directories', items: [
    { label: 'Submissions', href: '/startups-dir/review', icon: Inbox, words: 'approve reject founder new startup ai tool review queue take down fast approval' },
    { label: 'AI tools', href: '/tools-dir', icon: Wrench, words: 'tools directory categories tags' },
    { label: 'Startups', href: '/startups-dir', icon: Rocket, words: 'companies directory' },
    { label: 'Funding digests', href: '/funding-dir', icon: IndianRupee, words: 'rounds investment' },
    { label: 'Cities', href: '/cities', icon: MapPin, words: 'locations' },
  ] },
  { id: 'india-ai', label: 'India AI', items: [
    { label: 'Stats & cities', href: '/india-ai/stats', icon: Map, words: 'numbers metrics' },
    { label: 'Government schemes', href: '/india-ai/schemes', icon: Landmark, words: 'gov grants' },
    { label: 'Policy updates', href: '/india-ai/policy', icon: Newspaper, words: 'regulation' },
    { label: 'AI researchers', href: '/india-ai/researchers', icon: GraduationCap, words: 'academics' },
    { label: 'Indian AI tools', href: '/india-ai/tools', icon: Cpu },
    { label: 'Featured founders', href: '/india-ai/founders', icon: Award },
  ] },
  { id: 'events', label: 'Events', items: [
    { label: 'Events', href: '/events', icon: CalendarDays, words: 'meetups conferences import' },
    { label: 'Event subscribers', href: '/events/subscribers', icon: BellRing, words: 'alerts' },
  ] },
  { id: 'jobs', label: 'Jobs', items: [
    { label: 'Job listings', href: '/jobs-board', icon: Briefcase, words: 'job board roles hiring' },
    { label: 'Employers', href: '/employers', icon: Building, words: 'companies workspaces company check' },
    { label: 'Skills dictionary', href: '/skills', icon: BookOpen },
    { label: 'Careers applications', href: '/applications', icon: ClipboardList, words: 'udyaibase careers resumes candidates' },
  ] },
  { id: 'marketing', label: 'Marketing', items: [
    { label: 'Subscribers', href: '/subscribers', icon: Users, words: 'newsletter list emails' },
    { label: 'Newsletter', href: '/newsletter-admin', icon: Mail, words: 'campaigns send' },
    { label: 'Highlights', href: '/newsletter-highlights', icon: Sparkles },
    { label: 'Testimonials', href: '/testimonials', icon: Quote },
    { label: 'Premium promotions', href: '/promotions', icon: Gem, words: 'featured boost' },
    { label: 'Placements', href: '/placements', icon: LayoutTemplate, words: 'ads campaigns zones' },
    { label: 'Sponsors', href: '/sponsors', icon: Handshake },
    { label: 'Ad packages', href: '/advertise', icon: Package, words: 'advertise adv' },
    { label: 'Ad payments', href: '/advertise/payments', icon: Wallet, words: 'advertise adv' },
  ] },
  { id: 'people', label: 'People & support', items: [
    { label: 'People', href: '/people', icon: Contact, words: 'accounts users unified' },
    { label: 'Founders', href: '/founders', icon: UserCog },
    { label: 'Website users', href: '/web-users', icon: Globe, words: 'web users readers insights' },
    { label: 'Support tickets', href: '/support', icon: LifeBuoy, words: 'help requests' },
    { label: 'Admin users', href: '/users', icon: Shield, words: 'staff team roles' },
  ] },
  { id: 'insights', label: 'Insights', items: [
    { label: 'Analytics', href: '/analytics', icon: BarChart3, words: 'traffic views' },
    { label: 'Tool analytics', href: '/tool-analytics', icon: LineChart, words: 'clicks' },
    { label: 'Team activity', href: '/activity', icon: Activity, words: 'audit log history' },
  ] },
  { id: 'system', label: 'Billing & system', items: [
    { label: 'Billing & revenue', href: '/billing', icon: Receipt, words: 'payments plans prices pricing limits catalog offers promotions free plan launch offer invoices invoice settings sac hsn seller gstin host payouts razorpay route refunds revenue failed subscribers plans monthly yearly gst reconciliation tax filing' },
    { label: 'Plans', href: '/plans', icon: CreditCard, words: 'pricing subscriptions' },
    { label: 'Monitoring', href: '/monitoring', icon: HeartPulse, words: 'cron jobs health alerts ai spend' },
    { label: 'Consent logs', href: '/consent-logs', icon: Lock, words: 'privacy cookies' },
    { label: 'Settings', href: '/settings', icon: Settings, words: 'brand seo 2fa' },
    { label: 'Dev tools', href: '/dev-tools', icon: Terminal },
  ] },
];

export const ALL_NAV_ITEMS: (NavItem & { group: string })[] = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })));

/** The groups and items this role may open (empty groups dropped). */
export function navFor(role: string | null | undefined): NavGroup[] {
  return NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((i) => !!role && (SECTION_ROLES[i.href] ?? []).includes(role)) }))
    .filter((g) => g.items.length > 0);
}

/** The menu item a page belongs to: the longest address that matches ("/events/review" before "/events"). */
export function activeHref(pathname: string | null): string | null {
  if (!pathname) return null;
  const hit = ALL_NAV_ITEMS.map((i) => i.href)
    .filter((h) => pathname === h || pathname.startsWith(`${h}/`))
    .sort((a, b) => b.length - a.length)[0];
  return hit ?? null;
}

import { EVENT_DESCRIPTION_MAX } from "@/lib/events/limits";

/** Lists, templates and types for the event form. No state and no markup: see OrganizerEventForm.tsx. */

export const CATEGORIES = [
  "Conference","Hackathon","Summit","Workshop","Meetup","Demo Day","Webinar","Networking"
];
export const CATEGORY_VALUES = [
  "CONFERENCE","HACKATHON","SUMMIT","WORKSHOP","MEETUP","DEMO_DAY","WEBINAR","NETWORKING"
];
export const TIMEZONES = [
  { v: "Pacific/Midway", l: "(GMT-11:00) Midway Island" },
  { v: "Pacific/Honolulu", l: "(GMT-10:00) Hawaii" },
  { v: "America/Anchorage", l: "(GMT-09:00) Alaska" },
  { v: "America/Los_Angeles", l: "(GMT-08:00) Pacific Time (US)" },
  { v: "America/Denver", l: "(GMT-07:00) Mountain Time (US)" },
  { v: "America/Chicago", l: "(GMT-06:00) Central Time (US)" },
  { v: "America/New_York", l: "(GMT-05:00) Eastern Time (US)" },
  { v: "America/Caracas", l: "(GMT-04:30) Caracas" },
  { v: "America/Halifax", l: "(GMT-04:00) Atlantic Time" },
  { v: "America/Sao_Paulo", l: "(GMT-03:00) São Paulo" },
  { v: "Atlantic/South_Georgia", l: "(GMT-02:00) Mid-Atlantic" },
  { v: "Atlantic/Azores", l: "(GMT-01:00) Azores" },
  { v: "UTC", l: "(GMT+00:00) UTC" },
  { v: "Europe/London", l: "(GMT+00:00) London" },
  { v: "Europe/Paris", l: "(GMT+01:00) Paris, Berlin" },
  { v: "Europe/Istanbul", l: "(GMT+03:00) Istanbul" },
  { v: "Africa/Cairo", l: "(GMT+02:00) Cairo" },
  { v: "Europe/Moscow", l: "(GMT+03:00) Moscow" },
  { v: "Asia/Dubai", l: "(GMT+04:00) Dubai" },
  { v: "Asia/Karachi", l: "(GMT+05:00) Karachi" },
  { v: "Asia/Kolkata", l: "(GMT+05:30) India Standard Time — Kolkata" },
  { v: "Asia/Kathmandu", l: "(GMT+05:45) Kathmandu" },
  { v: "Asia/Dhaka", l: "(GMT+06:00) Dhaka" },
  { v: "Asia/Bangkok", l: "(GMT+07:00) Bangkok" },
  { v: "Asia/Singapore", l: "(GMT+08:00) Singapore" },
  { v: "Asia/Shanghai", l: "(GMT+08:00) Beijing, Shanghai" },
  { v: "Asia/Tokyo", l: "(GMT+09:00) Tokyo" },
  { v: "Asia/Seoul", l: "(GMT+09:00) Seoul" },
  { v: "Australia/Sydney", l: "(GMT+10:00) Sydney" },
  { v: "Pacific/Noumea", l: "(GMT+11:00) New Caledonia" },
  { v: "Pacific/Auckland", l: "(GMT+12:00) Auckland" },
];
export const MAX_DESC = EVENT_DESCRIPTION_MAX;
export const STEPS = [
  { num: 1, label: "Basics" },
  { num: 2, label: "Date & time" },
  { num: 3, label: "Location" },
  { num: 4, label: "Tickets" },
  { num: 5, label: "Publish" },
];

export function slugify(t: string) {
  return t.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export const TEMPLATES: Record<string, { category: string; format: string; topics: string[]; unlimited: boolean; capacity: string; multiDay: boolean; ticketTiers: { name: string; type: string; quantity: string; description: string }[] }> = {
  hackathon: {
    category: "HACKATHON", format: "IN_PERSON", topics: ["AI", "Web3", "DevTools"],
    unlimited: false, capacity: "200", multiDay: true,
    ticketTiers: [
      { name: "Participant", type: "FREE", quantity: "150", description: "Build and present your project" },
      { name: "Mentor / Judge", type: "FREE", quantity: "50", description: "Guide teams and evaluate projects" },
    ],
  },
  meetup: {
    category: "MEETUP", format: "IN_PERSON", topics: ["Networking", "Community"],
    unlimited: false, capacity: "100", multiDay: false, ticketTiers: [],
  },
  webinar: {
    category: "WEBINAR", format: "VIRTUAL", topics: ["Learning", "Industry"],
    unlimited: true, capacity: "", multiDay: false, ticketTiers: [],
  },
  conference: {
    category: "CONFERENCE", format: "IN_PERSON", topics: ["Industry", "Innovation", "Leadership"],
    unlimited: false, capacity: "500", multiDay: true,
    ticketTiers: [
      { name: "Early Bird", type: "EARLY_BIRD", quantity: "100", description: "Limited early pricing" },
      { name: "Regular", type: "REGULAR", quantity: "300", description: "Standard admission" },
      { name: "VIP", type: "VIP", quantity: "50", description: "Front row, networking dinner" },
    ],
  },
};

export interface EventData {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  category: string;
  format: string;
  status: string;
  startAt: string;
  endAt: string;
  timezone: string;
  venueName?: string | null;
  address?: string | null;
  venueMapUrl?: string | null;
  meetingLink?: string | null;
  meetingProvider?: string | null;
  meetingExternalId?: string | null;
  coverImageUrl?: string | null;
  description?: any;
  capacity?: number | null;
  visibility: string;
  approvalRequired: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  speakers?: { id?: string; name: string; title?: string | null; company?: string | null; headshotUrl?: string | null; bio?: string | null }[];
  agendaItems?: { startTime: string; endTime?: string | null; dayNumber?: number | null; title: string; description?: string | null }[];
  ticketTiers?: { id?: string; name: string; tierType: string; quantity?: number | null; description?: string | null; priceCents?: number }[];
  customQuestions?: { id?: string; questionText: string; questionType: string; required: boolean; options?: any }[];
  tags?: { tag: { name: string } }[];
  startupId?: string | null;
}

/** One ticket, speaker or agenda row as the form holds it while editing. */
export type TicketTierDraft = { id?: string; name: string; type: string; quantity: string; description: string; priceRupees: string };
export type SpeakerDraft = { id?: string; name: string; title: string; company: string; linkedin: string; photo: string; photoError: string; uploading?: boolean };
export type AgendaDraft = { day: number; time: string; endTime: string; title: string; speaker: string };

/** What the live preview and the full preview read from the form. They only show it; the form owns it. */
export interface EventFormView {
  title: string; subtitle: string; category: string; topics: string[]; coverImageUrl: string; description: string;
  startDate: string; startTime: string; endDate: string; endTime: string; multiDay: boolean; agendaDays: number;
  format: string; venueName: string; address: string; city: string; meetingLink: string;
  unlimited: boolean; capacity: string; waitlist: boolean; approvalRequired: boolean;
  ticketTiers: TicketTierDraft[]; speakers: SpeakerDraft[]; agenda: AgendaDraft[];
  contactEmail: string; website: string;
}

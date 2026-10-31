export interface GuideStep {
  /** data-tour names to spotlight; the first visible one wins. Omit for a centered card. */
  target?: string | string[];
  title: string;
  body: string;
}

export interface Tour {
  id: string;
  /** Shown on the first card, e.g. "Quick tour". */
  label: string;
  steps: GuideStep[];
}

const nav = (href: string) => [`nav:${href}`, `mnav:${href}`];

const GUIDE_REMINDER: GuideStep = {
  target: "guide",
  title: "Need a refresher?",
  body: "Select Guide at any time to replay the tour for the page you're on.",
};

export const TOURS: Record<string, Tour> = {
  home: {
    id: "home",
    label: "Welcome tour",
    steps: [
      {
        title: "Welcome to your organizer dashboard",
        body: "Create events, manage registrations, check people in and grow your audience, all from here. This tour takes about a minute.",
      },
      { target: "checklist", title: "Your setup checklist", body: "Work through these steps to get your first event live. Each one takes a few minutes." },
      { target: "templates", title: "Start from a template", body: "Templates pre-fill the schedule, tickets and registration questions for common event types." },
      { target: "create-event", title: "Create an event", body: "Start here. Most organizers publish their first event in under 10 minutes." },
      { target: "attention", title: "Needs your attention", body: "Things worth doing now, such as reviewing a waitlist, finishing a draft or setting up your website widget." },
      { target: "stats", title: "Your numbers", body: "Registrations, page-view conversion, check-in rate and waitlist for the last 30 days." },
      { target: "upcoming", title: "Upcoming events", body: "Your next events with registrations against capacity. Select one to manage it." },
      { target: nav("/organizer/events"), title: "Events", body: "All your events, drafts and published. Edit, publish, share or embed them from here." },
      { target: nav("/organizer/attendees"), title: "Attendees", body: "Everyone who registered across your events. Approve requests, manage the waitlist and export to CSV." },
      { target: nav("/organizer/check-in"), title: "Check-in", body: "On event day, scan tickets with your phone camera or search attendees by name, email or phone." },
      { target: nav("/organizer/analytics"), title: "Analytics", body: "See where your visitors come from and how many of them register." },
      { target: nav("/organizer/promote"), title: "Promote", body: "Email or WhatsApp your past attendees about upcoming events." },
      { target: nav("/organizer/embed"), title: "Website widget", body: "Show your events on your own website and let visitors register there." },
      { target: nav("/organizer/team"), title: "Team", body: "Invite co-organizers and check-in staff, each with the right level of access." },
      { target: "mnav:more", title: "More", body: "Analytics, Promote, Website widget, Team, Settings and Help are all one tap away here." },
      { target: "search", title: "Search anything", body: "Press ⌘K (Ctrl+K on Windows) to jump to any event, attendee or page." },
      GUIDE_REMINDER,
    ],
  },
  events: {
    id: "events",
    label: "Events tour",
    steps: [
      { target: "create-event", title: "Create an event", body: "Start from scratch or a template. You can save a draft and publish when you're ready." },
      { target: "events-list", title: "Your events", body: "Every event with its status, date and registrations. Drafts aren't visible to the public." },
      { target: "event-publish", title: "Publish a draft", body: "Drafts get a Publish button here. We check the dates and title before it goes live." },
      { target: "event-actions", title: "Event actions", body: "View the public page, edit, promote, share, embed on your website, download attendees, unpublish or delete." },
      GUIDE_REMINDER,
    ],
  },
  attendees: {
    id: "attendees",
    label: "Attendees tour",
    steps: [
      { target: "attendee-search", title: "Find anyone", body: "Search by name, email, company or event." },
      { target: "attendee-table", title: "Manage registrations", body: "Approve or decline requests, move people off the waitlist and see who has checked in." },
      { target: "attendee-export", title: "Export", body: "Download attendees as a CSV file for badges, follow-ups or your CRM." },
      GUIDE_REMINDER,
    ],
  },
  checkin: {
    id: "checkin",
    label: "Check-in tour",
    steps: [
      { target: "checkin-event", title: "Choose the event", body: "Pick the event you're checking people into. Stats below update for that event." },
      { target: "checkin-mode", title: "Camera or manual", body: "Camera scans the QR code on each ticket. Manual lets you search by phone, name or email." },
      { target: "checkin-search", title: "Check someone in", body: "Type a phone number, name or email and press Check in. Duplicate check-ins are flagged." },
      GUIDE_REMINDER,
    ],
  },
  analytics: {
    id: "analytics",
    label: "Analytics tour",
    steps: [
      { target: "analytics-traffic", title: "Traffic sources", body: "Where your event page visitors come from, such as search, social, email or your website widget." },
      { target: "analytics-funnel", title: "Registration funnel", body: "How many visitors view, register and finally check in. Use it to spot where people drop off." },
      { target: "analytics-performance", title: "Event performance", body: "Compare views, registrations and conversion for each event." },
      GUIDE_REMINDER,
    ],
  },
  promote: {
    id: "promote",
    label: "Promote tour",
    steps: [
      { target: "promote-event", title: "Choose an event", body: "Pick the event you want to promote. Its details fill the message automatically." },
      { target: "promote-message", title: "Write your message", body: "Choose email or WhatsApp, filter your audience by city or occupation, then preview before you send." },
      GUIDE_REMINDER,
    ],
  },
  team: {
    id: "team",
    label: "Team tour",
    steps: [
      {
        target: "team-invite",
        title: "Invite your team",
        body: "Admins have full access. Managers run events. Staff can view and check people in. Check-in users can only scan tickets. You can limit anyone to specific events.",
      },
      GUIDE_REMINDER,
    ],
  },
  settings: {
    id: "settings",
    label: "Settings tour",
    steps: [
      { target: "settings-tabs", title: "Your settings", body: "Organization details, connected accounts, notifications, security and data export are grouped into these tabs." },
      GUIDE_REMINDER,
    ],
  },
  widget: {
    id: "widget",
    label: "Website widget tour",
    steps: [
      {
        title: "Welcome to your website widget",
        body: "Show your Udyaibase events on your own website and let visitors register right there. This tour takes under a minute.",
      },
      { target: "preview", title: "Live preview", body: "This is your widget with your real events. Switch between Desktop and Mobile, or Light and Dark, to see what visitors see." },
      { target: "platform", title: "Choose your platform", body: "Tell us where your website is built, such as WordPress, Webflow or React, and we'll show the exact steps." },
      { target: "code", title: "Copy your code", body: "Paste these two lines on your website once. New events and design changes appear automatically. Not technical? Use “Send to my developer”." },
      { target: "status", title: "Check it's live", body: "This turns green the first time your widget loads on your website, and we'll email you. You can also check a page directly." },
      { target: "customize", title: "Make it yours", body: "Change the title, layout, colors, fonts and button. Every change saves automatically and shows in the preview right away." },
      GUIDE_REMINDER,
    ],
  },
};

export function tourForPath(pathname: string): Tour | null {
  if (pathname === "/organizer") return TOURS.home;
  if (pathname === "/organizer/events") return TOURS.events;
  if (pathname.startsWith("/organizer/attendees")) return TOURS.attendees;
  if (pathname.startsWith("/organizer/check-in")) return TOURS.checkin;
  if (pathname.startsWith("/organizer/analytics")) return TOURS.analytics;
  if (pathname.startsWith("/organizer/promote")) return TOURS.promote;
  if (pathname.startsWith("/organizer/team")) return TOURS.team;
  if (pathname.startsWith("/organizer/settings")) return TOURS.settings;
  if (pathname.startsWith("/organizer/embed")) return TOURS.widget;
  return null;
}

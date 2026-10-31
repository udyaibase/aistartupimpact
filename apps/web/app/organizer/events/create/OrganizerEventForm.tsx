"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Loader2, Calendar, MapPin, Video, X, Upload, Clock,
  Users, Globe, Image as ImageIcon, ChevronDown, Plus, Trash2,
  Mail, Eye, User, Mic, Check, Copy, ChevronRight, Ticket, Send,
  ExternalLink,
} from "lucide-react";
import CitySelect from "@/components/events/CitySelect";

const RichTextEditor = dynamic(() => import("@/components/organizer/RichTextEditor"), { ssr: false });

const CATEGORIES = [
  "Conference","Hackathon","Summit","Workshop","Meetup","Demo Day","Webinar","Networking"
];
const CATEGORY_VALUES = [
  "CONFERENCE","HACKATHON","SUMMIT","WORKSHOP","MEETUP","DEMO_DAY","WEBINAR","NETWORKING"
];
const TIMEZONES = [
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
const MAX_DESC = 2000;
const STEPS = [
  { num: 1, label: "Basics" },
  { num: 2, label: "Date & time" },
  { num: 3, label: "Location" },
  { num: 4, label: "Tickets" },
  { num: 5, label: "Publish" },
];

function slugify(t: string) {
  return t.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

const TEMPLATES: Record<string, { category: string; format: string; topics: string[]; unlimited: boolean; capacity: string; multiDay: boolean; ticketTiers: { name: string; type: string; quantity: string; description: string }[] }> = {
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

interface EventData {
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
  meetingLink?: string | null;
  coverImageUrl?: string | null;
  description?: any;
  capacity?: number | null;
  visibility: string;
  approvalRequired: boolean;
  metaTitle?: string | null;
  metaDescription?: string | null;
  speakers?: { name: string; title?: string | null; company?: string | null; headshotUrl?: string | null; bio?: string | null }[];
  agendaItems?: { startTime: string; title: string; description?: string | null }[];
  ticketTiers?: { id?: string; name: string; tierType: string; quantity?: number | null; description?: string | null; priceCents?: number }[];
  customQuestions?: { questionText: string; questionType: string; required: boolean; options?: any }[];
  tags?: { tag: { name: string } }[];
}

export default function OrganizerEventForm({ organizerId, template, event }: { organizerId: string; template?: string; event?: EventData }) {
  const tpl = template ? TEMPLATES[template] : undefined;
  const isEdit = !!event;
  const isDraft = isEdit && event?.status === "DRAFT";
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [copiedSlug, setCopiedSlug] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [currentStep, setCurrentStep] = useState(1);
  const [stepStatus, setStepStatus] = useState<Record<number, "not_started" | "in_progress" | "complete">>({
    1: "in_progress", 2: "not_started", 3: "not_started", 4: "not_started", 5: "not_started",
  });

  // Helper to extract date/time from ISO string
  const extractDate = (iso?: string) => iso ? new Date(iso).toISOString().slice(0, 10) : "";
  const extractTime = (iso?: string) => iso ? new Date(iso).toTimeString().slice(0, 5) : "";

  // 1. Basics
  const [title, setTitle] = useState(event?.title ?? "");
  const [subtitle, setSubtitle] = useState(event?.subtitle ?? "");
  const [category, setCategory] = useState(event?.category ?? tpl?.category ?? "CONFERENCE");
  const [topicInput, setTopicInput] = useState("");
  const [topics, setTopics] = useState<string[]>(event?.tags?.map(t => t.tag.name) ?? tpl?.topics ?? []);
  const [slug, setSlug] = useState(event?.slug ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(event?.coverImageUrl ?? "");

  // 2. Date & time
  const [startDate, setStartDate] = useState(extractDate(event?.startAt));
  const [startTime, setStartTime] = useState(extractTime(event?.startAt));
  const [endTime, setEndTime] = useState(extractTime(event?.endAt));
  const [endDate, setEndDate] = useState(() => {
    if (!event?.startAt || !event?.endAt) return "";
    const sd = new Date(event.startAt).toISOString().slice(0, 10);
    const ed = new Date(event.endAt).toISOString().slice(0, 10);
    return sd !== ed ? ed : "";
  });
  const [multiDay, setMultiDay] = useState(() => {
    if (!event?.startAt || !event?.endAt) return tpl?.multiDay ?? false;
    return new Date(event.startAt).toISOString().slice(0, 10) !== new Date(event.endAt).toISOString().slice(0, 10);
  });
  const [timezone, setTimezone] = useState(() => {
    if (event?.timezone) return event.timezone;
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) return tz;
    } catch {}
    return "Asia/Kolkata";
  });

  // 3. Location
  const [format, setFormat] = useState(event?.format ?? tpl?.format ?? "IN_PERSON");
  const [venueName, setVenueName] = useState(event?.venueName ?? "");
  const [address, setAddress] = useState(event?.address?.split("|||")[0] ?? "");
  const [city, setCity] = useState("");
  const [venueMapUrl, setVenueMapUrl] = useState(event?.address?.split("|||")[1] ?? "");
  const [meetingLink, setMeetingLink] = useState(event?.meetingLink ?? "");

  // 4. Tickets
  const [unlimited, setUnlimited] = useState(event ? !event.capacity : tpl?.unlimited ?? true);
  const [capacity, setCapacity] = useState(event?.capacity ? String(event.capacity) : tpl?.capacity ?? "");
  const [waitlist, setWaitlist] = useState(true);
  const [approvalRequired, setApprovalRequired] = useState(event?.approvalRequired ?? false);
  const [ticketTiers, setTicketTiers] = useState<{ id?: string; name: string; type: string; quantity: string; description: string; priceRupees: string }[]>(
    event?.ticketTiers?.map(t => ({ id: t.id, name: t.name, type: t.tierType, quantity: t.quantity ? String(t.quantity) : "", description: t.description ?? "", priceRupees: t.priceCents ? String(t.priceCents / 100) : "" }))
      ?? tpl?.ticketTiers?.map(t => ({ ...t, priceRupees: "" })) ?? []
  );
  // Paid tiers need an activated payout account (Settings → Payments).
  const [payoutsActive, setPayoutsActive] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/organizer/payouts").then(r => r.json()).then(d => setPayoutsActive(d.success ? d.payouts.status === "ACTIVATED" : false)).catch(() => setPayoutsActive(false));
  }, []);

  // 5. Publish
  const [visibility, setVisibility] = useState(event?.visibility ?? "PUBLIC");
  const [description, setDescription] = useState(() => {
    if (!event?.description) return "";
    if (typeof event.description === "object" && event.description?.html) return event.description.html;
    if (typeof event.description === "object" && event.description?.text) return event.description.text;
    if (typeof event.description === "string") return event.description;
    return "";
  });
  const [speakers, setSpeakers] = useState<{ name: string; title: string; company: string; linkedin: string; photo: string; photoError: string }[]>(
    event?.speakers?.map(s => ({ name: s.name, title: s.title ?? "", company: s.company ?? "", linkedin: s.bio ?? "", photo: s.headshotUrl ?? "", photoError: "" })) ?? []
  );
  const [agenda, setAgenda] = useState<{ time: string; title: string; speaker: string }[]>(
    event?.agendaItems?.map(a => ({ time: a.startTime, title: a.title, speaker: a.description ?? "" })) ?? []
  );
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [socialLinks, setSocialLinks] = useState({ twitter: "", linkedin: "", instagram: "" });
  const [customQuestions, setCustomQuestions] = useState<{ text: string; type: string; required: boolean; options: string }[]>(
    event?.customQuestions?.map(q => ({ text: q.questionText, type: q.questionType, required: q.required, options: Array.isArray(q.options) ? q.options.join(", ") : "" })) ?? []
  );
  const [seoTitle, setSeoTitle] = useState(event?.metaTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(event?.metaDescription ?? "");

  const showPhysical = format === "IN_PERSON" || format === "HYBRID";
  const showVirtual = format === "VIRTUAL" || format === "HYBRID";
  const generatedSlug = slugify(title + (city ? `-${city}` : ""));
  const eventSlug = slug || generatedSlug;

  const startAtISO = startDate && startTime ? `${startDate}T${startTime}` : "";
  const endAtISO = multiDay
    ? (endDate && endTime ? `${endDate}T${endTime}` : "")
    : (startDate && endTime ? `${startDate}T${endTime}` : "");

  const stepValid = useMemo(() => ({
    1: !!(title && category),
    2: !!(startDate && startTime && endTime),
    3: !!(
      (format === "VIRTUAL" && meetingLink) ||
      (format === "IN_PERSON" && venueName) ||
      (format === "HYBRID" && venueName && meetingLink)
    ),
    4: !!(unlimited || capacity),
    5: true,
  }), [title, category, startDate, startTime, endTime, format, venueName, meetingLink, unlimited, capacity]);

  const publishRequirements = useMemo(() => [
    { label: "Add a cover image", met: !!coverImageUrl },
    { label: "Name your event", met: !!title },
    { label: "Choose an event type", met: !!category },
    { label: "Set date & time", met: !!(startDate && startTime && endTime) },
    { label: "Add a venue or online link", met: !!(venueName || meetingLink || (format === "VIRTUAL" && meetingLink) || (format === "IN_PERSON" && venueName)) },
    { label: "Set up tickets", met: !!(unlimited || capacity) },
  ], [coverImageUrl, title, category, startDate, startTime, endTime, venueName, meetingLink, format, unlimited, capacity]);

  const metCount = publishRequirements.filter(r => r.met).length;

  const processFile = useCallback(async (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setFieldErrors(p => ({ ...p, cover: "Only JPG, PNG, WebP allowed" }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFieldErrors(p => ({ ...p, cover: "Max file size is 5MB" }));
      return;
    }
    setUploading(true);
    setFieldErrors(p => ({ ...p, cover: "" }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/organizer/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (d.success) setCoverImageUrl(d.url);
      else setFieldErrors(p => ({ ...p, cover: d.error || "Upload failed" }));
    } catch {
      setFieldErrors(p => ({ ...p, cover: "Upload failed" }));
    } finally {
      setUploading(false);
    }
  }, []);

  const addTopic = (val: string) => {
    const t = val.trim();
    if (t && topics.length < 5 && !topics.includes(t)) {
      setTopics(prev => [...prev, t]);
    }
    setTopicInput("");
  };

  const removeTopic = (idx: number) => {
    setTopics(prev => prev.filter((_, i) => i !== idx));
  };

  const copySlug = () => {
    navigator.clipboard.writeText(`udyaibase.com/e/${eventSlug}`);
    setCopiedSlug(true);
    setTimeout(() => setCopiedSlug(false), 2000);
  };

  const goToStep = (step: number) => {
    if (step >= 1 && step <= 5) {
      setStepStatus(prev => ({
        ...prev,
        [currentStep]: currentStep < step ? "complete" : prev[currentStep],
        [step]: prev[step] === "not_started" ? "in_progress" : prev[step],
      }));
      setCurrentStep(step);
    }
  };

  const nextStep = () => {
    setStepStatus(prev => ({ ...prev, [currentStep]: "complete" }));
    goToStep(currentStep + 1);
  };

  const nextStepLabel = currentStep < 5
    ? `Continue to ${STEPS[currentStep]?.label}`
    : "Publish event";

  // publish=true moves a draft live; on a published event every save keeps it published.
  const handleSubmit = async (publish = !isEdit || !isDraft) => {
    setError("");
    setFieldErrors({});
    const errs: Record<string, string> = {};
    if (!title) errs.title = "Title is required";
    if (!startAtISO) errs.startAt = "Start date/time is required";
    if (!endAtISO) errs.endAt = "End time is required";
    if (startAtISO && endAtISO && new Date(endAtISO) <= new Date(startAtISO)) errs.endAt = "End must be after start";
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      if (errs.title) goToStep(1);
      else if (errs.startAt || errs.endAt) goToStep(2);
      return;
    }
    setLoading(true);
    const payload = {
      title, slug: eventSlug, subtitle, category, format, timezone,
      startAt: new Date(startAtISO).toISOString(),
      endAt: new Date(endAtISO).toISOString(),
      venueName, address: venueMapUrl ? `${address}|||${venueMapUrl}` : address, meetingLink,
      description, capacity: unlimited ? null : capacity, coverImageUrl, visibility,
      approvalRequired,
      tags: topics.join(", "), contactEmail, website, city, speakers, agenda, socialLinks,
      customQuestions, ticketTiers,
      seoTitle: seoTitle || undefined,
      seoDescription: seoDescription || undefined,
      ...(isEdit && isDraft && publish ? { status: "PUBLISHED" } : {}),
    };
    try {
      const url = isEdit ? `/api/organizer/events/${event!.id}` : "/api/organizer/events";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!d.success) {
        setError(d.error || "Failed.");
        setLoading(false);
        return;
      }
      const justPublished = !isEdit || (isDraft && publish);
      router.push(justPublished ? `/organizer/events?published=${isEdit ? event!.id : d.data.id}` : "/organizer/events");
    } catch {
      setError("Network error.");
      setLoading(false);
    }
  };

  const ic = "w-full min-h-[44px] px-3.5 py-2.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand placeholder-gray-400 transition-colors";

  return (
    <div className="-mt-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm text-gray-400 font-jakarta mb-1 min-w-0">
            <Link href="/organizer/events" className="hover:text-brand transition-colors">Events</Link>
            <span>/</span>
            <span className="text-gray-600 dark:text-gray-300 truncate">{isEdit ? event!.title : "New event"}</span>
          </div>
          <h1 className="portal-title">{isEdit ? "Edit event" : "Create an event"}</h1>
          {isEdit && (
            <p className={`sm:hidden mt-1 text-xs font-semibold font-jakarta ${isDraft ? "text-gray-500" : "text-green-600"}`}>
              {isDraft ? "Draft · not visible to the public" : "Published"}
            </p>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          {isEdit && (
            <span className={`hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold font-jakarta ${
              isDraft ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" : "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isDraft ? "bg-gray-400" : "bg-green-500"}`} />
              {isDraft ? "Draft · not visible to the public" : "Published"}
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="px-5 py-2.5 text-sm font-semibold font-jakarta border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-200 flex items-center gap-2"
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>
          {isDraft && (
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={loading}
              className="px-5 py-2.5 text-sm font-semibold font-jakarta border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-200 disabled:opacity-50"
            >
              Save draft
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={loading || metCount < 4}
            title={metCount < 4 ? "Complete the required sections first" : undefined}
            className="px-6 py-2.5 text-sm font-bold font-jakarta bg-brand hover:bg-brand/90 text-white rounded-md disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {!isEdit ? "Publish" : isDraft ? "Save & publish" : "Save changes"}
          </button>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-1.5 mb-6 overflow-x-auto">
        {STEPS.map((step) => {
          const visited = stepStatus[step.num] !== "not_started" || step.num === currentStep;
          const isComplete = step.num !== currentStep && visited && stepValid[step.num as keyof typeof stepValid];
          const status = step.num === currentStep ? "current" : isComplete ? "complete" : "upcoming";
          const statusLabel = step.num === 5
            ? "Review & go live"
            : (status === "current" ? "In progress" : status === "complete" ? "Complete" : "Not started");
          return (
            <button
              key={step.num}
              type="button"
              onClick={() => goToStep(step.num)}
              className={`flex items-center gap-2.5 px-3 sm:px-5 py-3 min-h-[48px] rounded-md transition-colors whitespace-nowrap ${
                status === "current"
                  ? "bg-brand-50 dark:bg-brand-900/20 flex-[1.3]"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800 flex-1"
              }`}
            >
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                status === "current"
                  ? "bg-brand text-white"
                  : status === "complete"
                    ? "bg-green-500 text-white"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
              }`}>
                {status === "complete" ? <Check className="w-3.5 h-3.5" /> : step.num}
              </span>
              <div className={`${status === "current" ? "block" : "hidden"} sm:block text-left`}>
                <p className={`text-sm font-bold font-jakarta leading-tight ${
                  status === "current" ? "text-gray-900 dark:text-white" : status === "complete" ? "text-gray-700 dark:text-gray-200" : "text-gray-600 dark:text-gray-400"
                }`}>{step.label}</p>
                <p className={`text-xs font-jakarta leading-tight mt-0.5 ${
                  status === "current" ? "text-brand" : "text-gray-400"
                }`}>{statusLabel}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main layout: form + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
        {/* Form area */}
        <div className="space-y-4 min-w-0">

          {/* ═══ STEP 1: BASICS ═══ */}
          {currentStep === 1 && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-6">
              <h2 className="portal-section-title mb-1">Event basics</h2>
              <p className="text-sm text-gray-500 font-jakarta mb-5">What attendees see first. Fields marked * are required.</p>

              <div className="space-y-5">
                {/* Cover image */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta">Cover image <span className="text-brand">*</span></label>
                    <span className="text-xs text-gray-400 font-jakarta">16:9 · 1920×1080 recommended · JPG, PNG or WebP · up to 5 MB</span>
                  </div>
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); }}
                    onClick={() => fileRef.current?.click()}
                    className={`flex items-center gap-4 px-4 py-4 border border-gray-200 dark:border-gray-700 rounded-md cursor-pointer transition-colors ${
                      dragOver ? "border-brand bg-brand/5" : "hover:border-gray-300 dark:hover:border-gray-600"
                    } ${uploading ? "opacity-60 pointer-events-none" : ""}`}
                  >
                    <div className="w-10 h-10 rounded-md bg-red-50 dark:bg-brand/10 flex items-center justify-center shrink-0">
                      {uploading ? <Loader2 className="w-5 h-5 animate-spin text-brand" /> : <Upload className="w-5 h-5 text-brand" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta">
                        {coverImageUrl ? "Image uploaded" : uploading ? "Uploading..." : "Drag an image here or click to upload"}
                      </p>
                      <p className="text-xs text-gray-400 font-jakarta mt-0.5">
                        {coverImageUrl ? "Click to change · image preview shown in live preview →" : "Tip: avoid text near the edges — it gets cropped on mobile."}
                      </p>
                    </div>
                    {coverImageUrl && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setCoverImageUrl(""); }}
                        className="text-xs text-red-500 font-semibold font-jakarta hover:underline shrink-0"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { if (e.target.files?.[0]) processFile(e.target.files[0]); e.target.value = ""; }} className="hidden" />
                  {fieldErrors.cover && <p className="text-xs text-red-500 font-jakarta mt-1">{fieldErrors.cover}</p>}
                </div>

                {/* Event name */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta">Event name *</label>
                    <span className="text-xs text-gray-400 font-jakarta">{title.length}/80</span>
                  </div>
                  <input
                    value={title}
                    onChange={e => {
                      const v = e.target.value.slice(0, 80);
                      setTitle(v);
                      setSlug(slugify(v + (city ? `-${city}` : "")));
                      if (fieldErrors.title) setFieldErrors(p => ({ ...p, title: "" }));
                    }}
                    placeholder="e.g. AI Builders Hackathon 2026"
                    className={`${ic} ${fieldErrors.title ? "!border-red-400 !ring-red-200" : ""}`}
                    maxLength={80}
                  />
                  {fieldErrors.title && <p className="text-xs text-red-500 font-jakarta mt-1">{fieldErrors.title}</p>}
                  <p className="text-xs text-gray-400 font-jakarta mt-1">Keep it short and specific — it appears on tickets, emails and search results.</p>
                </div>

                {/* One-line summary */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta">One-line summary</label>
                    <span className="text-xs text-gray-400 font-jakarta">{subtitle.length}/140</span>
                  </div>
                  <textarea
                    value={subtitle}
                    onChange={e => setSubtitle(e.target.value.slice(0, 140))}
                    placeholder="e.g. A 24-hour build sprint for 500+ AI founders and engineers"
                    className={`${ic} resize-none`}
                    rows={2}
                    maxLength={140}
                  />
                  <p className="text-xs text-gray-400 font-jakarta mt-1">Shown under the name on event cards. You&apos;ll add the full description later.</p>
                </div>

                {/* Event type */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-2 block">Event type *</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((c, i) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCategory(CATEGORY_VALUES[i])}
                        className={`px-4 py-2 rounded-md text-sm font-jakarta font-medium border transition-colors ${
                          category === CATEGORY_VALUES[i]
                            ? "border-brand bg-brand/5 text-brand"
                            : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300"
                        }`}
                      >
                        {category === CATEGORY_VALUES[i] && <Check className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Topics */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5 block">
                    Topics <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2 p-2 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 min-h-[42px]">
                    {topics.map((t, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-md text-sm font-jakarta text-gray-700 dark:text-gray-300">
                        {t}
                        <button type="button" onClick={() => removeTopic(i)} className="text-gray-400 hover:text-red-500 ml-0.5"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                    {topics.length < 5 && (
                      <input
                        value={topicInput}
                        onChange={e => setTopicInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTopic(topicInput); }
                        }}
                        onBlur={() => { if (topicInput.trim()) addTopic(topicInput); }}
                        placeholder={topics.length === 0 ? "Type a topic and press Enter" : ""}
                        className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-sm font-jakarta text-gray-700 dark:text-gray-200 placeholder-gray-400"
                      />
                    )}
                  </div>
                  <p className="text-xs text-gray-400 font-jakarta mt-1">Up to 5. Helps people discover your event.</p>
                </div>

                {/* Event link */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5 block">Event link</label>
                  <div className="flex items-center border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden bg-white dark:bg-gray-900">
                    <span className="px-3 py-2.5 text-sm text-gray-400 font-jakarta bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">udyaibase.com/e/</span>
                    <input
                      value={slug || generatedSlug}
                      onChange={e => setSlug(slugify(e.target.value))}
                      placeholder="your-event-name"
                      className="flex-1 px-3 py-2.5 bg-transparent border-none outline-none text-sm font-jakarta text-gray-700 dark:text-gray-200 font-mono"
                    />
                    <button type="button" onClick={copySlug} className="px-3 py-2.5 text-gray-400 hover:text-brand transition-colors border-l border-gray-200 dark:border-gray-700 flex items-center gap-1.5 text-xs font-jakarta">
                      {copiedSlug ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 font-jakarta mt-1">Generated from your event name. Edit it any time before publishing.</p>
                </div>
              </div>
            </div>
          )}

          {/* ═══ STEP 2: DATE & TIME ═══ */}
          {(currentStep === 1 || currentStep === 2) && (
            <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md ${
              currentStep === 2 ? "p-6" : ""
            }`}>
              {currentStep === 1 ? (
                <CollapsedStep num={2} label="Date & time" desc="Times are shown to attendees in their own time zone automatically." status={stepStatus[2] !== "not_started" && stepValid[2] ? "complete" : stepStatus[2]} onClick={() => goToStep(2)} />
              ) : (
                <>
                  <h2 className="portal-section-title mb-1">Date & time</h2>
                  <p className="text-sm text-gray-500 font-jakarta mb-5">Times are shown to attendees in their own time zone automatically.</p>

                  <div className="space-y-4">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={multiDay} onChange={e => setMultiDay(e.target.checked)} className="w-4 h-4 rounded text-brand focus:ring-brand border-gray-300" />
                      <span className="text-sm text-gray-700 dark:text-gray-200 font-jakarta">Runs over multiple days</span>
                    </label>

                    <div className={`grid gap-4 ${multiDay ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"}`}>
                      <div>
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5 block">Start date *</label>
                        <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); if (!multiDay) setEndDate(e.target.value); }} className={`${ic} ${fieldErrors.startAt ? "!border-red-400" : ""}`} />
                        {fieldErrors.startAt && <p className="text-xs text-red-500 font-jakarta mt-1">{fieldErrors.startAt}</p>}
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5 block">Start time *</label>
                        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={ic} />
                      </div>
                      {multiDay && (
                        <div>
                          <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5 block">End date *</label>
                          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={ic} min={startDate} />
                        </div>
                      )}
                      <div>
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5 block">End time *</label>
                        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={`${ic} ${fieldErrors.endAt ? "!border-red-400" : ""}`} />
                        {fieldErrors.endAt && <p className="text-xs text-red-500 font-jakarta mt-1">{fieldErrors.endAt}</p>}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5 block">Time zone *</label>
                      <div className="flex items-center gap-3">
                        <select value={timezone} onChange={e => setTimezone(e.target.value)} className={`${ic} max-w-md`}>
                          {TIMEZONES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                        </select>
                        <span className="text-xs text-gray-400 font-jakarta flex items-center gap-1 whitespace-nowrap">
                          <Clock className="w-3 h-3" /> Detected from your browser
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ STEP 3: LOCATION ═══ */}
          {(currentStep <= 3) && (
            <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md ${
              currentStep === 3 ? "p-6" : ""
            }`}>
              {currentStep !== 3 ? (
                <CollapsedStep num={3} label="Location" desc="In person, online or hybrid — add a venue or meeting link" status={stepStatus[3] !== "not_started" && stepValid[3] ? "complete" : stepStatus[3]} onClick={() => goToStep(3)} />
              ) : (
                <>
                  <h2 className="portal-section-title mb-1">Location</h2>
                  <p className="text-sm text-gray-500 font-jakarta mb-5">In person, online or hybrid — add a venue or meeting link.</p>

                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { v: "IN_PERSON", l: "In Person", I: MapPin },
                        { v: "VIRTUAL", l: "Virtual", I: Video },
                        { v: "HYBRID", l: "Hybrid", I: Globe },
                      ].map(f => (
                        <button
                          key={f.v}
                          type="button"
                          onClick={() => setFormat(f.v)}
                          className={`flex flex-col min-[420px]:flex-row items-center justify-center gap-1 min-[420px]:gap-2 px-2 sm:px-4 py-3 min-h-[56px] rounded-md border text-sm transition-colors ${
                            format === f.v
                              ? "border-brand bg-brand/5 text-brand"
                              : "border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300"
                          }`}
                        >
                          <f.I className="w-4 h-4" />
                          <span className="text-sm font-jakarta font-medium">{f.l}</span>
                        </button>
                      ))}
                    </div>

                    {showPhysical && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5 block">Venue name</label>
                          <input value={venueName} onChange={e => setVenueName(e.target.value)} placeholder="e.g. Bangalore International Centre" className={ic} />
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5 block">Address</label>
                          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Street address" className={ic} />
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5 block">City</label>
                          <CitySelect value={city} onChange={(c) => { setCity(c.name); setSlug(slugify(title + (c.name ? `-${c.name}` : ""))); }} placeholder="Search city..." />
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5 block">Google Maps URL <span className="font-normal text-gray-400">(optional)</span></label>
                          <input type="url" value={venueMapUrl} onChange={e => setVenueMapUrl(e.target.value)} placeholder="https://maps.google.com/..." className={ic} />
                        </div>
                      </div>
                    )}

                    {showVirtual && (
                      <div>
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5 block">Meeting link</label>
                        <input type="url" value={meetingLink} onChange={e => setMeetingLink(e.target.value)} placeholder="Zoom, Google Meet or other link" className={ic} />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ STEP 4: TICKETS ═══ */}
          {(currentStep <= 4) && (
            <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md ${
              currentStep === 4 ? "p-6" : ""
            }`}>
              {currentStep !== 4 ? (
                <CollapsedStep num={4} label="Tickets & capacity" desc="Free or paid tickets, capacity, approval and waitlist" status={stepStatus[4] !== "not_started" && stepValid[4] ? "complete" : stepStatus[4]} onClick={() => goToStep(4)} />
              ) : (
                <>
                  <h2 className="portal-section-title mb-1">Tickets & capacity</h2>
                  <p className="text-sm text-gray-500 font-jakarta mb-5">Free or paid tickets, capacity, approval and waitlist.</p>

                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-2 block">Capacity</label>
                      <label className="flex items-center gap-2.5 cursor-pointer mb-3">
                        <input type="checkbox" checked={unlimited} onChange={e => setUnlimited(e.target.checked)} className="w-4 h-4 rounded text-brand focus:ring-brand border-gray-300" />
                        <span className="text-sm text-gray-700 dark:text-gray-200 font-jakarta">Unlimited spots</span>
                      </label>
                      {!unlimited && (
                        <input type="number" min={1} value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="e.g. 500" className={`${ic} max-w-xs`} />
                      )}
                    </div>

                    {!unlimited && (
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input type="checkbox" checked={waitlist} onChange={e => setWaitlist(e.target.checked)} className="w-4 h-4 rounded text-brand focus:ring-brand border-gray-300" />
                        <span className="text-sm text-gray-700 dark:text-gray-200 font-jakarta">Enable waitlist when full</span>
                      </label>
                    )}

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={approvalRequired} onChange={e => setApprovalRequired(e.target.checked)} className="w-4 h-4 rounded text-brand focus:ring-brand border-gray-300" />
                      <span className="text-sm text-gray-700 dark:text-gray-200 font-jakarta">Require manual approval for registrations</span>
                    </label>

                    {/* Ticket tiers */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta">Ticket types</label>
                        <button type="button" onClick={() => setTicketTiers(p => [...p, { name: "General", type: "REGULAR", quantity: "", description: "", priceRupees: "" }])} className="inline-flex items-center gap-1 min-h-[40px] px-1 text-sm text-brand font-semibold font-jakarta hover:underline">
                          <Plus className="w-3.5 h-3.5" /> Add tier
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 font-jakarta mb-3">
                        Tiers are free unless you set a price. Use them for capacity limits too (VIP, early bird).{" "}
                        {payoutsActive === false && <>To sell paid tickets, <Link href="/organizer/settings?tab=payment" className="text-brand font-semibold hover:underline">set up payouts</Link> first.</>}
                      </p>
                      {ticketTiers.map((t, i) => (
                        <div key={i} className="flex gap-2 mb-2 items-start p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2">
                            <input value={t.name} onChange={e => { const u = [...ticketTiers]; u[i] = { ...u[i], name: e.target.value }; setTicketTiers(u); }} placeholder="Tier name" className={ic} />
                            <select value={t.type} onChange={e => { const u = [...ticketTiers]; u[i] = { ...u[i], type: e.target.value }; setTicketTiers(u); }} className={ic}>
                              <option value="REGULAR">Regular</option><option value="EARLY_BIRD">Early Bird</option><option value="VIP">VIP</option>
                            </select>
                            <input type="number" min={1} value={t.quantity} onChange={e => { const u = [...ticketTiers]; u[i] = { ...u[i], quantity: e.target.value }; setTicketTiers(u); }} placeholder="Qty (∞)" className={ic} />
                            <input type="number" min={0} step="1" inputMode="numeric" value={t.priceRupees} disabled={!payoutsActive && !Number(t.priceRupees)}
                              title={payoutsActive ? "Price in rupees (blank or 0 = free)" : "Set up payouts in Settings → Payments to sell tickets"}
                              onChange={e => { const u = [...ticketTiers]; u[i] = { ...u[i], priceRupees: e.target.value }; setTicketTiers(u); }}
                              placeholder={payoutsActive ? "₹ Price (free)" : "Free"} aria-label="Ticket price in rupees" className={`${ic} disabled:opacity-60`} />
                          </div>
                          <button type="button" onClick={() => setTicketTiers(p => p.filter((_, j) => j !== i))} aria-label="Remove" className="w-10 h-10 shrink-0 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ STEP 5: REVIEW & PUBLISH ═══ */}
          {currentStep <= 5 && (
            <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md ${
              currentStep === 5 ? "p-6" : ""
            }`}>
              {currentStep !== 5 ? (
                <CollapsedStep num={5} label="Review & publish" desc="Visibility, registration questions and final check" status={stepStatus[5] !== "not_started" && stepValid[5] ? "complete" : stepStatus[5]} onClick={() => goToStep(5)} />
              ) : (
                <>
                  <h2 className="portal-section-title mb-1">Review & publish</h2>
                  <p className="text-sm text-gray-500 font-jakarta mb-5">Visibility, description, speakers and final check.</p>

                  <div className="space-y-5">
                    {/* Visibility */}
                    <div>
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5 block">Visibility</label>
                      <select value={visibility} onChange={e => setVisibility(e.target.value)} className={ic}>
                        <option value="PUBLIC">Public — Anyone can find & register</option>
                        <option value="UNLISTED">Unlisted — Only via direct link</option>
                        <option value="INVITE_ONLY">Private — Invite only</option>
                      </select>
                    </div>

                    {/* Description */}
                    <div>
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5 block">Full description</label>
                      <RichTextEditor
                        content={description}
                        onChange={setDescription}
                        placeholder="What's this event about? Describe the format, topics, and what attendees will learn..."
                        maxLength={MAX_DESC}
                      />
                    </div>

                    {/* Speakers */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta">Speakers</label>
                        <button type="button" onClick={() => setSpeakers(p => [...p, { name: "", title: "", company: "", linkedin: "", photo: "", photoError: "" }])} className="inline-flex items-center gap-1 min-h-[40px] px-1 text-sm text-brand font-semibold font-jakarta hover:underline">
                          <Plus className="w-3.5 h-3.5" /> Add speaker
                        </button>
                      </div>
                      {speakers.length === 0 ? (
                        <p className="text-xs text-gray-400 font-jakarta">No speakers added yet.</p>
                      ) : speakers.map((s, i) => (
                        <div key={i} className="mb-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                          <div className="flex items-start justify-between mb-3">
                            <span className="text-xs font-bold text-gray-400 font-jakarta">Speaker {i + 1}</span>
                            <button type="button" onClick={() => setSpeakers(p => p.filter((_, j) => j !== i))} aria-label="Remove speaker" className="w-10 h-10 -mt-2 -mr-2 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" /></button>
                          </div>
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-14 h-14 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden flex items-center justify-center shrink-0">
                              {s.photo ? <Image src={s.photo} alt="" width={56} height={56} unoptimized className="w-full h-full object-cover" /> : <User className="w-5 h-5 text-gray-400" />}
                            </div>
                            <div>
                              <input type="file" accept="image/jpeg,image/png,image/webp" id={`speaker-photo-${i}`} className="hidden" onChange={async e => {
                                const file = e.target.files?.[0]; if (!file) return;
                                const u = [...speakers];
                                if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { u[i] = { ...u[i], photoError: "Only JPG, PNG, WebP" }; setSpeakers(u); e.target.value = ""; return; }
                                if (file.size > 2 * 1024 * 1024) { u[i] = { ...u[i], photoError: "Max 2MB" }; setSpeakers(u); e.target.value = ""; return; }
                                u[i] = { ...u[i], photoError: "" }; setSpeakers(u);
                                const fd = new FormData(); fd.append("file", file);
                                const r = await fetch("/api/organizer/upload", { method: "POST", body: fd });
                                const d = await r.json();
                                const u2 = [...speakers];
                                if (d.success) u2[i] = { ...u2[i], photo: d.url, photoError: "" };
                                else u2[i] = { ...u2[i], photoError: d.error || "Upload failed" };
                                setSpeakers(u2); e.target.value = "";
                              }} />
                              <label htmlFor={`speaker-photo-${i}`} className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-md text-sm font-semibold text-gray-600 dark:text-gray-300 font-jakarta cursor-pointer hover:bg-gray-100 transition-colors">
                                <Upload className="w-3 h-3" /> {s.photo ? "Change" : "Upload photo"}
                              </label>
                              {s.photoError && <p className="text-xs text-red-500 font-jakarta mt-1">{s.photoError}</p>}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input value={s.name} onChange={e => { const u = [...speakers]; u[i] = { ...u[i], name: e.target.value }; setSpeakers(u); }} placeholder="Full name *" className={ic} />
                            <input value={s.title} onChange={e => { const u = [...speakers]; u[i] = { ...u[i], title: e.target.value }; setSpeakers(u); }} placeholder="Role" className={ic} />
                            <input value={s.company} onChange={e => { const u = [...speakers]; u[i] = { ...u[i], company: e.target.value }; setSpeakers(u); }} placeholder="Company" className={ic} />
                            <input value={s.linkedin} onChange={e => { const u = [...speakers]; u[i] = { ...u[i], linkedin: e.target.value }; setSpeakers(u); }} placeholder="LinkedIn URL" className={ic} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Contact */}
                    <div>
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-2 block">Contact info</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="Contact email" className={ic} />
                        <input type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="Event website (optional)" className={ic} />
                      </div>
                    </div>

                    {/* Custom registration fields */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta">Custom registration questions</label>
                        <button type="button" onClick={() => setCustomQuestions(p => [...p, { text: "", type: "TEXT", required: false, options: "" }])} className="inline-flex items-center gap-1 min-h-[40px] px-1 text-sm text-brand font-semibold font-jakarta hover:underline">
                          <Plus className="w-3.5 h-3.5" /> Add field
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 font-jakarta mb-2">Default: Name, Email, Phone, Occupation, City.</p>
                      {customQuestions.map((q, i) => (
                        <div key={i} className="flex gap-2 mb-2 items-start p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                          <div className="flex-1 space-y-2">
                            <input value={q.text} onChange={e => { const u = [...customQuestions]; u[i] = { ...u[i], text: e.target.value }; setCustomQuestions(u); }} placeholder="Question text" className={ic} />
                            <div className="flex gap-2 items-center">
                              <select value={q.type} onChange={e => { const u = [...customQuestions]; u[i] = { ...u[i], type: e.target.value }; setCustomQuestions(u); }} className={`${ic} !w-auto`}>
                                <option value="TEXT">Text</option><option value="SELECT">Dropdown</option><option value="CHECKBOX">Checkbox</option>
                              </select>
                              <label className="flex items-center gap-2 min-h-[44px] px-1 cursor-pointer">
                                <input type="checkbox" checked={q.required} onChange={e => { const u = [...customQuestions]; u[i] = { ...u[i], required: e.target.checked }; setCustomQuestions(u); }} className="w-4 h-4 rounded text-brand" />
                                <span className="text-sm text-gray-600 font-jakarta">Required</span>
                              </label>
                            </div>
                            {q.type === "SELECT" && <input value={q.options} onChange={e => { const u = [...customQuestions]; u[i] = { ...u[i], options: e.target.value }; setCustomQuestions(u); }} placeholder="Options (comma-separated)" className={ic} />}
                          </div>
                          <button type="button" onClick={() => setCustomQuestions(p => p.filter((_, j) => j !== i))} aria-label="Remove" className="w-10 h-10 shrink-0 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-500 font-jakarta bg-red-50 dark:bg-red-900/20 p-3 rounded-md">{error}</p>}

          {/* Bottom bar: sits above the mobile tab bar */}
          <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] md:bottom-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur border border-gray-200 dark:border-gray-700 rounded-md p-3 sm:p-4 flex items-center justify-between gap-2 shadow-lg z-10">
            <span className="hidden sm:block text-sm text-gray-400 font-jakarta">
              Step {currentStep} of 5 · {metCount} of 6 publish requirements met
            </span>
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                aria-label="Preview"
                className="sm:hidden w-12 h-12 shrink-0 flex items-center justify-center border border-gray-200 dark:border-gray-700 rounded-md text-gray-600 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800"
              >
                <Eye className="w-5 h-5" />
              </button>
              {isDraft && (
                <button
                  type="button"
                  onClick={() => handleSubmit(false)}
                  disabled={loading}
                  className="min-h-[48px] sm:min-h-[40px] px-4 text-sm font-semibold font-jakarta border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors disabled:opacity-50"
                >
                  Save draft
                </button>
              )}
              {currentStep < 5 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="flex-1 sm:flex-none min-h-[48px] sm:min-h-[40px] px-5 text-sm font-bold font-jakarta bg-brand hover:bg-brand/90 active:bg-brand-700 text-white rounded-md transition-colors flex items-center justify-center gap-1.5"
                >
                  <span className="sm:hidden">Continue</span>
                  <span className="hidden sm:inline">{nextStepLabel}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSubmit()}
                  disabled={loading}
                  className="flex-1 sm:flex-none min-h-[48px] sm:min-h-[40px] px-5 text-sm font-bold font-jakarta bg-brand hover:bg-brand/90 active:bg-brand-700 text-white rounded-md disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isEdit && !isDraft ? "Save changes" : "Publish event"} <Send className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ═══ RIGHT SIDEBAR ═══ */}
        <div className="hidden lg:block">
          <div className="sticky top-2 space-y-5">
            {/* Live preview */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-base font-semibold text-gray-700 dark:text-gray-200 font-jakarta">Live preview</p>
                <span className="flex items-center gap-1.5 text-xs text-gray-400 font-jakarta">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Updates as you type
                </span>
              </div>
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden shadow-sm">
                {/* Cover preview */}
                <div className="relative bg-gray-100 dark:bg-gray-800" style={{ aspectRatio: "16/9" }}>
                  {coverImageUrl ? (
                    <Image src={coverImageUrl} alt="" fill unoptimized className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                    </div>
                  )}
                  {/* Category badge */}
                  <span className="absolute top-2.5 left-2.5 text-xs font-bold uppercase bg-white/90 dark:bg-gray-900/90 text-brand px-2.5 py-1 rounded-full font-jakarta">
                    {CATEGORIES[CATEGORY_VALUES.indexOf(category)]}
                  </span>
                </div>

                <div className="p-4 space-y-2.5">
                  {/* Date & time */}
                  {startDate ? (
                    <p className="text-sm text-brand font-semibold font-jakarta">
                      {new Date(startDate + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                      {startTime && ` · ${startTime}`}
                    </p>
                  ) : (
                    <p className="text-sm text-brand font-jakarta">Date & time to be set</p>
                  )}

                  {/* Title */}
                  <h3 className="font-sora font-bold text-base text-navy dark:text-white leading-snug">
                    {title || <span className="text-gray-300 dark:text-gray-600">Your event name</span>}
                  </h3>

                  {/* Location */}
                  <p className="text-sm text-gray-500 font-jakarta flex items-center gap-1.5">
                    {format === "VIRTUAL" ? (
                      <><Video className="w-3.5 h-3.5 text-purple-500" /> Online</>
                    ) : city || venueName ? (
                      <><MapPin className="w-3.5 h-3.5 text-gray-400" /> {venueName || city}</>
                    ) : (
                      <><MapPin className="w-3.5 h-3.5 text-gray-300" /> Location to be announced</>
                    )}
                  </p>

                  {/* Tags */}
                  {topics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {topics.map((t, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded font-jakarta">#{t}</span>
                      ))}
                    </div>
                  )}

                  {/* Price + capacity */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                    <div>
                      <span className="text-sm font-bold text-green-600 font-jakarta">Free</span>
                      <p className="text-xs text-gray-400 font-jakarta">{unlimited ? "Unlimited spots" : `${capacity || "0"} spots`}</p>
                    </div>
                    <div className="px-5 py-2 bg-brand text-white text-sm font-bold font-jakarta rounded-md">
                      Register
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Ready to publish checklist */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-base font-semibold text-gray-700 dark:text-gray-200 font-jakarta">Ready to publish</p>
                <span className="text-sm font-bold text-gray-400 font-jakarta">{metCount}/6</span>
              </div>
              {/* Progress bar */}
              <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full mb-4 overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${(metCount / 6) * 100}%` }} />
              </div>
              <div className="space-y-3">
                {publishRequirements.map((req, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      req.met ? "bg-green-500" : "border-2 border-gray-200 dark:border-gray-700"
                    }`}>
                      {req.met && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`text-sm font-jakarta ${req.met ? "text-gray-400 line-through" : "text-gray-700 dark:text-gray-300"}`}>
                      {req.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full preview overlay */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 overflow-y-auto">
          {/* Sticky header bar */}
          <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
            <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="px-2.5 py-1 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-md">
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 font-jakarta">Preview mode</span>
                </div>
                <span className="text-xs text-gray-400 font-jakarta hidden sm:inline">This is how attendees will see your event</span>
              </div>
              <button type="button" onClick={() => setShowPreview(false)} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold font-jakarta border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-200">
                <X className="w-4 h-4" />
                Close
              </button>
            </div>
          </div>

          <div className="max-w-3xl mx-auto px-4 pb-16">
            {/* Cover image */}
            <div className="relative bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden mt-6" style={{ aspectRatio: "2/1" }}>
              {coverImageUrl ? (
                <Image src={coverImageUrl} alt="" fill unoptimized className="object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                  <ImageIcon className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                  <span className="text-sm text-gray-400 font-jakarta">No cover image added</span>
                </div>
              )}
              <span className="absolute top-3 left-3 text-xs font-bold uppercase bg-white/90 dark:bg-gray-900/90 text-brand px-3 py-1.5 rounded-full font-jakarta">
                {CATEGORIES[CATEGORY_VALUES.indexOf(category)]}
              </span>
            </div>

            {/* Main content */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Left column — event details */}
              <div className="md:col-span-2 space-y-8">
                {/* Date & title */}
                <div>
                  {startDate ? (
                    <p className="text-sm text-brand font-semibold font-jakarta mb-2">
                      {new Date(startDate + "T00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                      {startTime && ` · ${startTime}`}
                      {endTime && ` – ${endTime}`}
                      {multiDay && endDate && (
                        <> to {new Date(endDate + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</>
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-brand font-jakarta mb-2">Date & time to be set</p>
                  )}
                  <h1 className="font-sora font-bold text-3xl text-navy dark:text-white leading-tight">
                    {title || <span className="text-gray-300 dark:text-gray-600">Your event name</span>}
                  </h1>
                  {subtitle && <p className="text-base text-gray-500 font-jakarta mt-2">{subtitle}</p>}
                </div>

                {/* Topics */}
                {topics.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {topics.map((t, i) => (
                      <span key={i} className="text-xs px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-md font-jakarta font-medium">#{t}</span>
                    ))}
                  </div>
                )}

                {/* Description */}
                {description ? (
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white font-jakarta uppercase tracking-wider mb-3">About this event</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta whitespace-pre-wrap leading-relaxed">{description}</p>
                  </div>
                ) : (
                  <div className="py-6 border border-dashed border-gray-200 dark:border-gray-700 rounded-md text-center">
                    <p className="text-sm text-gray-400 font-jakarta">No description added yet</p>
                  </div>
                )}

                {/* Speakers */}
                {speakers.length > 0 && (
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white font-jakarta uppercase tracking-wider mb-4">Speakers</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {speakers.map((s, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-md">
                          <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                            {s.photo ? <Image src={s.photo} alt="" width={48} height={48} className="rounded-full object-cover" /> : <User className="w-5 h-5 text-gray-400" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 dark:text-white font-jakarta truncate">{s.name}</p>
                            {s.title && <p className="text-xs text-gray-500 font-jakarta truncate">{s.title}{s.company && ` · ${s.company}`}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Agenda */}
                {agenda.length > 0 && (
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 dark:text-white font-jakarta uppercase tracking-wider mb-4">Agenda</h2>
                    <div className="space-y-0">
                      {agenda.map((item, i) => (
                        <div key={i} className="flex gap-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                          <span className="text-sm font-semibold text-brand font-jakarta w-16 shrink-0">{item.time || "TBD"}</span>
                          <div>
                            <p className="text-sm font-semibold text-gray-800 dark:text-white font-jakarta">{item.title}</p>
                            {item.speaker && <p className="text-xs text-gray-500 font-jakarta mt-0.5">{item.speaker}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right column — registration card */}
              <div>
                <div className="sticky top-20 space-y-4">
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-5 space-y-4">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white font-jakarta">Registration</h3>

                    {/* Ticket tiers */}
                    {ticketTiers.length > 0 ? (
                      <div className="space-y-2">
                        {ticketTiers.map((tier, i) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                            <div>
                              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta">{tier.name}</p>
                              {tier.description && <p className="text-xs text-gray-400 font-jakarta">{tier.description}</p>}
                            </div>
                            <span className={`text-sm font-bold font-jakarta ${Number(tier.priceRupees) > 0 ? "text-gray-900 dark:text-white" : "text-green-600"}`}>{Number(tier.priceRupees) > 0 ? `₹${Number(tier.priceRupees).toLocaleString("en-IN")}` : "Free"}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta">General admission</span>
                        <span className="text-sm font-bold text-green-600 font-jakarta">Free</span>
                      </div>
                    )}

                    <p className="text-xs text-gray-400 font-jakarta">
                      {unlimited ? "Unlimited spots available" : `${capacity || "0"} spots available`}
                      {waitlist && " · Waitlist enabled"}
                    </p>

                    <div className="w-full py-3 bg-brand text-white text-sm font-bold font-jakarta rounded-md text-center">
                      Register now
                    </div>

                    {approvalRequired && (
                      <p className="text-xs text-gray-400 font-jakarta text-center">Registration requires organizer approval</p>
                    )}
                  </div>

                  {/* Location card */}
                  <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-5 space-y-2">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white font-jakarta">Location</h3>
                    {format === "VIRTUAL" ? (
                      <div className="flex items-center gap-2 text-sm text-purple-600 font-jakarta">
                        <Video className="w-4 h-4" />
                        Online event
                      </div>
                    ) : venueName || city ? (
                      <div className="space-y-1">
                        {venueName && <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta">{venueName}</p>}
                        {address && <p className="text-sm text-gray-500 font-jakarta">{address}</p>}
                        {city && <p className="text-sm text-gray-500 font-jakarta">{city}</p>}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 font-jakarta">Location to be announced</p>
                    )}
                    {format === "HYBRID" && meetingLink && (
                      <div className="flex items-center gap-2 text-sm text-purple-600 font-jakarta pt-2 border-t border-gray-100 dark:border-gray-800">
                        <Video className="w-4 h-4" />
                        Also available online
                      </div>
                    )}
                  </div>

                  {/* Contact */}
                  {(contactEmail || website) && (
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-5 space-y-2">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white font-jakarta">Contact</h3>
                      {contactEmail && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-gray-400" /> {contactEmail}
                        </p>
                      )}
                      {website && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 text-gray-400" /> {website}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CollapsedStep({
  num, label, desc, status, onClick,
}: {
  num: number; label: string; desc: string; status: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left">
      <div className="flex items-center gap-3">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          status === "complete"
            ? "bg-green-500 text-white"
            : "bg-gray-100 dark:bg-gray-800 text-gray-500"
        }`}>
          {status === "complete" ? <Check className="w-3.5 h-3.5" /> : num}
        </span>
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta">{label}</p>
          <p className="text-xs text-gray-400 font-jakarta">{desc}</p>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400" />
    </button>
  );
}

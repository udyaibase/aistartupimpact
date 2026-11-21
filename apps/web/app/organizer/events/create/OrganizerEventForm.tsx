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
import { DateField, TimeField, addMinutes, durationLabel, formatDateLabel, formatTimeLabel } from "@/components/ui/DateTimeFields";

import ImageCropDialog from "@/components/organizer/ImageCropDialog";
import MeetingLinkButtons from "@/components/organizer/MeetingLinkButtons";
import { EVENT_DESCRIPTION_MAX } from "@/lib/events/limits";
import { cleanTimeZone, DEFAULT_EVENT_TIMEZONE, utcToZoned, zonedToUtc } from "@/lib/events/zoned-time";
import CollapsedStep from "./CollapsedStep";
import EventFormSidebar from "./EventFormSidebar";
import EventPreview from "./EventPreview";
import { eventPriceLabel } from "@/lib/events/price-label";
import { CATEGORIES, CATEGORY_VALUES, TIMEZONES, MAX_DESC, STEPS, slugify, TEMPLATES, EventData, type EventFormView } from "./event-form-data";
const RichTextEditor = dynamic(() => import("@/components/organizer/RichTextEditor"), { ssr: false });

/** Minutes from a start time to an end time on the same day; null when either is missing or the end isn't later. */
function durationMinutes(start: string, end: string): number | null {
  const a = /^(\d{2}):(\d{2})$/.exec(start), b = /^(\d{2}):(\d{2})$/.exec(end);
  if (!a || !b) return null;
  const minutes = Number(b[1]) * 60 + Number(b[2]) - (Number(a[1]) * 60 + Number(a[2]));
  return minutes > 0 ? minutes : null;
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
  // Saved times are shown in the event's own time zone (IST by default), not the computer's.
  const eventTz = cleanTimeZone(event?.timezone);
  const extractDate = (iso?: string) => utcToZoned(iso, eventTz).date;
  const extractTime = (iso?: string) => utcToZoned(iso, eventTz).time;

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
    const sd = extractDate(event.startAt);
    const ed = extractDate(event.endAt);
    return sd !== ed ? ed : "";
  });
  const [multiDay, setMultiDay] = useState(() => {
    if (!event?.startAt || !event?.endAt) return tpl?.multiDay ?? false;
    return extractDate(event.startAt) !== extractDate(event.endAt);
  });
  /** Days the agenda can use (1 for a single-day event, up to 14). */
  const agendaDays = (() => {
    if (!multiDay || !startDate || !endDate) return 1;
    const n = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
    return Math.min(14, Math.max(1, Number.isFinite(n) ? n : 1));
  })();
  // India Standard Time unless the event already has its own (most events on Udyaibase are in India).
  const [timezone, setTimezone] = useState(() => (event?.timezone ? cleanTimeZone(event.timezone) : DEFAULT_EVENT_TIMEZONE));

  // 3. Location
  const [format, setFormat] = useState(event?.format ?? tpl?.format ?? "IN_PERSON");
  const [venueName, setVenueName] = useState(event?.venueName ?? "");
  const [address, setAddress] = useState(event?.address?.split("|||")[0] ?? "");
  const [city, setCity] = useState("");
  const [venueMapUrl, setVenueMapUrl] = useState(event?.venueMapUrl ?? event?.address?.split("|||")[1] ?? "");
  const [meetingLink, setMeetingLink] = useState(event?.meetingLink ?? "");
  // Set when the link was made with a connected Zoom/Google account (so time changes move the meeting too).
  const [meeting, setMeeting] = useState<{ provider: string; externalId: string; proof?: string } | null>(
    event?.meetingProvider && event?.meetingExternalId ? { provider: event.meetingProvider, externalId: event.meetingExternalId } : null,
  );

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
  // "Hosted by <startup>": verified startups this host belongs to (none → the picker is hidden).
  const [startupId, setStartupId] = useState<string>(event?.startupId ?? "");
  const [taggable, setTaggable] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/organizer/startups").then((r) => r.json()).then((d) => { if (d?.startups) setTaggable(d.startups); }).catch(() => {});
  }, []);
  const [description, setDescription] = useState(() => {
    if (!event?.description) return "";
    if (typeof event.description === "object" && event.description?.html) return event.description.html;
    if (typeof event.description === "object" && event.description?.text) return event.description.text;
    if (typeof event.description === "string") return event.description;
    return "";
  });
  const [speakers, setSpeakers] = useState<{ id?: string; name: string; title: string; company: string; linkedin: string; photo: string; photoError: string; uploading?: boolean }[]>(
    event?.speakers?.map(s => ({ id: s.id, name: s.name, title: s.title ?? "", company: s.company ?? "", linkedin: s.bio ?? "", photo: s.headshotUrl ?? "", photoError: "" })) ?? []
  );
  /** Speaker photo waiting in the crop dialog, before upload. */
  const [cropFor, setCropFor] = useState<{ index: number; file: File } | null>(null);
  const setSpeakerPhoto = (index: number, patch: { photo?: string; photoError: string; uploading?: boolean }) =>
    setSpeakers((list) => list.map((sp, j) => (j === index ? { ...sp, ...patch } : sp)));
  async function uploadSpeakerPhoto(index: number, blob: Blob) {
    setSpeakerPhoto(index, { photoError: "", uploading: true });
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], `speaker-${index + 1}.jpg`, { type: "image/jpeg" }));
      const r = await fetch("/api/organizer/upload", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      setSpeakerPhoto(index, d.success ? { photo: d.url, photoError: "", uploading: false } : { photoError: d.error || "Upload failed", uploading: false });
    } catch {
      setSpeakerPhoto(index, { photoError: "Upload failed. Check your connection.", uploading: false });
    }
  }

  // Agenda: built here when creating; an existing event's agenda (days, tracks, recordings) is edited on its own page.
  const [agenda, setAgenda] = useState<{ day: number; time: string; endTime: string; title: string; speaker: string }[]>(
    event?.agendaItems?.map(a => ({ day: a.dayNumber ?? 1, time: a.startTime, endTime: a.endTime ?? "", title: a.title, speaker: "" })) ?? []
  );
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [socialLinks, setSocialLinks] = useState({ twitter: "", linkedin: "", instagram: "" });
  const [customQuestions, setCustomQuestions] = useState<{ id?: string; text: string; type: string; required: boolean; options: string }[]>(
    event?.customQuestions?.map(q => ({ id: q.id, text: q.questionText, type: q.questionType, required: q.required, options: Array.isArray(q.options) ? q.options.join(", ") : "" })) ?? []
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

  // What the two previews show. They are separate files (EventFormSidebar, EventPreview) and only read this.
  const view: EventFormView = { title, subtitle, category, topics, coverImageUrl, description, startDate, startTime, endDate, endTime, multiDay, agendaDays, format, venueName, address, city, meetingLink, unlimited, capacity, waitlist, approvalRequired, ticketTiers, speakers, agenda, contactEmail, website };
  const priceLabel = eventPriceLabel(ticketTiers.map(t => Math.round((Number(t.priceRupees) || 0) * 100))).label;

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
    if (!isEdit) {
      const bad = agenda.findIndex(a => (a.title.trim() || a.time) && (!a.title.trim() || !a.time || (a.endTime && a.endTime <= a.time)));
      if (bad >= 0) {
        const a = agenda[bad];
        setError(`Agenda, session ${bad + 1}: ${!a.title.trim() ? "add a title" : !a.time ? "add a start time" : "it ends before it starts"}.`);
        goToStep(5);
        return;
      }
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      if (errs.title) goToStep(1);
      else if (errs.startAt || errs.endAt) goToStep(2);
      return;
    }
    setLoading(true);
    const payload = {
      title, slug: eventSlug, subtitle, category, format, timezone,
      // The typed date and time are in the chosen time zone, whatever zone this computer is in.
      startAt: zonedToUtc(startDate, startTime, timezone)!.toISOString(),
      endAt: zonedToUtc(multiDay ? endDate : startDate, endTime, timezone)!.toISOString(),
      venueName, address, venueMapUrl, meetingLink,
      meetingProvider: meeting?.provider ?? null, meetingExternalId: meeting?.externalId ?? null, meetingProof: meeting?.proof ?? null,
      description, capacity: unlimited ? null : capacity, coverImageUrl, visibility,
      approvalRequired,
      // New events send the agenda built here. Existing events never resend it (it's edited on its own page), so saving can't wipe it.
      ...(!isEdit ? { agenda: agenda.filter(a => a.title.trim() || a.time).map(a => ({ dayNumber: a.day, startTime: a.time, endTime: a.endTime, title: a.title.trim(), speaker: a.speaker })) } : {}),
      tags: topics.join(", "), contactEmail, website, city, speakers, socialLinks,
      customQuestions, ticketTiers,
      seoTitle: seoTitle || undefined,
      seoDescription: seoDescription || undefined,
      ...(taggable.length || event?.startupId ? { startupId: startupId || null } : {}),
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
      const id = isEdit ? event!.id : d.data.id;
      if (d.data?.status === "PENDING_REVIEW") { router.push(`/organizer/events?review=${id}`); return; }
      const justPublished = !isEdit || (isDraft && publish);
      router.push(justPublished ? `/organizer/events?published=${id}` : "/organizer/events");
    } catch {
      setError("Network error.");
      setLoading(false);
    }
  };

  const todayIso = useMemo(() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; }, []);
  const whenLength = durationLabel(startDate, startTime, multiDay ? endDate : startDate, endTime);
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
                    aria-label="Event name"
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
                    aria-label="One-line summary"
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
                        aria-label="Add a topic"
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
                      aria-label="Event link"
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

                    <div className={`grid gap-4 ${multiDay ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
                      <div>
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5">{multiDay ? "Starts on *" : "Date *"}</p>
                        <DateField label={multiDay ? "Start date" : "Date"} value={startDate} min={todayIso} invalid={!!fieldErrors.startAt}
                          onChange={(v) => { setStartDate(v); if (!multiDay || !endDate || endDate < v) setEndDate(v); }} />
                        {fieldErrors.startAt && <p className="text-xs text-red-500 font-jakarta mt-1">{fieldErrors.startAt}</p>}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5">Start time *</p>
                        <TimeField label="Start time" value={startTime}
                          onChange={(v) => {
                            // Keep the event the same length when the start moves (a new event defaults to two hours).
                            const length = durationMinutes(startTime, endTime) ?? 120;
                            setStartTime(v);
                            if (!multiDay) setEndTime(addMinutes(v, length) ?? addMinutes(v, 60) ?? "23:59");
                          }} />
                      </div>
                      {multiDay && (
                        <div>
                          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5">Ends on *</p>
                          <DateField label="End date" value={endDate} min={startDate || todayIso} onChange={setEndDate} />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5">End time *</p>
                        <TimeField label="End time" value={endTime} after={multiDay ? undefined : startTime} invalid={!!fieldErrors.endAt} onChange={setEndTime} />
                        {fieldErrors.endAt && <p className="text-xs text-red-500 font-jakarta mt-1">{fieldErrors.endAt}</p>}
                      </div>
                    </div>

                    {/* One tap for the usual lengths, and the whole thing read back in words. */}
                    {!multiDay && startTime && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs text-gray-500 font-jakarta mr-1">Length</span>
                        {([[60, "1 hour"], [90, "1.5 hours"], [120, "2 hours"], [180, "3 hours"], [240, "4 hours"], [480, "Full day"]] as const).map(([minutes, name]) => {
                          const end = addMinutes(startTime, minutes);
                          if (!end) return null;
                          const on = end === endTime;
                          return (
                            <button key={minutes} type="button" aria-pressed={on} onClick={() => setEndTime(end)}
                              className={`h-8 px-3 rounded-full border text-xs font-medium font-jakarta transition-colors ${on ? "border-brand bg-brand/10 text-brand" : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-brand hover:text-brand"}`}>
                              {name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {startDate && startTime && endTime && (
                      <p role="status" className={`rounded-md px-3.5 py-2.5 text-sm font-jakarta ${whenLength ? "bg-gray-50 dark:bg-gray-800/60 text-gray-800 dark:text-gray-100" : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"}`}>
                        {whenLength
                          ? <><span className="font-semibold">{formatDateLabel(startDate)}</span>, {formatTimeLabel(startTime)} to {multiDay && endDate && endDate !== startDate ? `${formatDateLabel(endDate)}, ` : ""}{formatTimeLabel(endTime)} <span className="text-gray-500 dark:text-gray-400">· {whenLength}</span></>
                          : "The end is before the start. Choose a later end time."}
                      </p>
                    )}

                    <div>
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5 block">Time zone *</label>
                      <div className="flex items-center gap-3">
                        <select value={timezone} onChange={e => setTimezone(e.target.value)} className={`${ic} max-w-md`}>
                          {TIMEZONES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                        </select>
                        <span className="text-xs text-gray-400 font-jakarta flex items-center gap-1 whitespace-nowrap">
                          <Clock className="w-3 h-3" /> {timezone === DEFAULT_EVENT_TIMEZONE ? "India Standard Time (default)" : "Times are in this time zone"}
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
                        <input type="url" value={meetingLink} onChange={e => { setMeetingLink(e.target.value); setMeeting(null); }} placeholder="Zoom, Google Meet or other link" className={ic} />
                        <MeetingLinkButtons
                          title={title}
                          startAt={startDate && startTime ? zonedToUtc(startDate, startTime, timezone)?.toISOString() ?? "" : ""}
                          endAt={startDate && endTime ? zonedToUtc(multiDay ? endDate : startDate, endTime, timezone)?.toISOString() ?? "" : ""}
                          timezone={timezone}
                          eventId={event?.id}
                          onCreated={(m) => { setMeetingLink(m.joinUrl); setMeeting({ provider: m.provider, externalId: m.externalId, proof: m.meetingProof }); }}
                        />
                        {meeting && <p className="mt-1.5 text-xs text-gray-500">If you change the date or time, we’ll update this {meeting.provider === "zoom" ? "Zoom meeting" : "Google Meet"} too.</p>}
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

                    {/* Hosted by a startup (only verified startups the host belongs to) */}
                    {(taggable.length > 0 || startupId) && (
                      <div>
                        <label htmlFor="ev-startup" className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta mb-1.5 block">Hosted by a startup <span className="font-normal text-gray-500">(optional)</span></label>
                        <select id="ev-startup" value={startupId} onChange={e => setStartupId(e.target.value)} className={ic}>
                          <option value="">No startup: hosted by me or my community</option>
                          {taggable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          {startupId && !taggable.some((s) => s.id === startupId) && <option value={startupId}>Current startup</option>}
                        </select>
                        <p className="text-xs text-gray-500 font-jakarta mt-1">Shows “Hosted by” with a Verified startup badge. Only verified startups you belong to are listed; tagged events publish without review.</p>
                      </div>
                    )}

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
                              <input type="file" accept="image/jpeg,image/png,image/webp" id={`speaker-photo-${i}`} className="hidden" onChange={e => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (!file) return;
                                if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setSpeakerPhoto(i, { photoError: "Only JPG, PNG, WebP" }); return; }
                                // The crop makes a small square image, so larger originals (phone photos) are fine here.
                                if (file.size > 15 * 1024 * 1024) { setSpeakerPhoto(i, { photoError: "Max 15MB" }); return; }
                                setSpeakerPhoto(i, { photoError: "" });
                                setCropFor({ index: i, file });
                              }} />
                              <label htmlFor={`speaker-photo-${i}`} className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-md text-sm font-semibold text-gray-600 dark:text-gray-300 font-jakarta cursor-pointer hover:bg-gray-100 transition-colors">
                                {s.uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} {s.uploading ? "Uploading..." : s.photo ? "Change" : "Upload photo"}
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

                    {/* Agenda: built on its own page (days, tracks, session times), so it's never lost when this form saves. */}
                    <div className="rounded-md border border-gray-200 dark:border-gray-700 p-4">
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta">Agenda</p>
                      {event?.id ? (
                        <>
                          <p className="mt-1 text-xs text-gray-500 font-jakarta">Sessions with times, days and tracks. Attendees can build their own schedule from it.</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Link href={`/organizer/events/${event.id}/agenda`} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-md border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200 font-jakarta hover:bg-gray-50 dark:hover:bg-gray-800">
                              <Calendar className="w-4 h-4" /> {agenda.length ? `Edit agenda (${agenda.length} sessions)` : "Add agenda"}
                            </Link>
                            <Link href={`/organizer/events/${event.id}/speakers`} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-md border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-800 dark:text-gray-200 font-jakarta hover:bg-gray-50 dark:hover:bg-gray-800">
                              <Mic className="w-4 h-4" /> Call for speakers
                            </Link>
                          </div>
                          <p className="mt-2 text-xs text-gray-500 font-jakarta">Save your changes here first: those pages open separately.</p>
                        </>
                      ) : (
                        <>
                          <p className="mt-1 text-xs text-gray-500 font-jakarta">Optional. Add sessions now, or later from <strong>Agenda</strong> in the event’s menu, where you can also add tracks.</p>
                          {agenda.length > 0 && (
                            <div className="mt-3 space-y-3">
                              {agenda.map((a, i) => (
                                <div key={i} className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
                                  <div className="flex items-start gap-2">
                                    <input value={a.title} onChange={e => setAgenda(l => l.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} placeholder="Session title *" maxLength={200} aria-label={`Session ${i + 1} title`} className={ic} />
                                    <button type="button" onClick={() => setAgenda(l => l.filter((_, j) => j !== i))} aria-label={`Remove session ${i + 1}`} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" /></button>
                                  </div>
                                  <div className={`mt-2 grid gap-2 ${agendaDays > 1 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
                                    {agendaDays > 1 && (
                                      <select value={Math.min(a.day, agendaDays)} onChange={e => setAgenda(l => l.map((x, j) => j === i ? { ...x, day: Number(e.target.value) } : x))} aria-label={`Session ${i + 1} day`} className={ic}>
                                        {Array.from({ length: agendaDays }, (_, d) => <option key={d} value={d + 1}>Day {d + 1}</option>)}
                                      </select>
                                    )}
                                    <label className="block">
                                      <span className="sr-only">Starts</span>
                                      <TimeField label={`Session ${i + 1} start time`} placeholder="Starts" value={a.time} onChange={(v) => setAgenda(l => l.map((x, j) => j === i ? { ...x, time: v } : x))} />
                                    </label>
                                    <label className="block">
                                      <span className="sr-only">Ends</span>
                                      <TimeField label={`Session ${i + 1} end time`} placeholder="Ends" after={a.time} value={a.endTime} onChange={(v) => setAgenda(l => l.map((x, j) => j === i ? { ...x, endTime: v } : x))} />
                                    </label>
                                    <select value={a.speaker} onChange={e => setAgenda(l => l.map((x, j) => j === i ? { ...x, speaker: e.target.value } : x))} aria-label={`Session ${i + 1} speaker`} className={`${ic} col-span-2 sm:col-span-1`}>
                                      <option value="">No speaker</option>
                                      {speakers.filter(sp => sp.name.trim()).map(sp => <option key={sp.name} value={sp.name.trim()}>{sp.name.trim()}</option>)}
                                    </select>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          <button type="button" disabled={agenda.length >= 100}
                            onClick={() => setAgenda(l => {
                              const last = l[l.length - 1];
                              // Next session starts when the previous one ends, on the same day.
                              return [...l, { day: last?.day ?? 1, time: last?.endTime || "", endTime: "", title: "", speaker: "" }];
                            })}
                            className="mt-3 inline-flex items-center gap-1 min-h-[40px] px-1 text-sm text-brand font-semibold font-jakarta hover:underline disabled:opacity-50">
                            <Plus className="w-4 h-4" /> Add session
                          </button>
                        </>
                      )}
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
        <EventFormSidebar {...view} priceLabel={priceLabel} metCount={metCount} publishRequirements={publishRequirements} />
      </div>

      {/* Full preview overlay */}
      {showPreview && <EventPreview {...view} onClose={() => setShowPreview(false)} />}

      {cropFor && (
        <ImageCropDialog
          file={cropFor.file}
          title="Adjust speaker photo"
          onCancel={() => setCropFor(null)}
          onCropped={(blob) => { const { index } = cropFor; setCropFor(null); void uploadSpeakerPhoto(index, blob); }}
        />
      )}
    </div>
  );
}

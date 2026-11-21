"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown, Search, Users } from "lucide-react";
import BottomSheet from "@/components/ui/BottomSheet";

export interface PickerEvent {
  id: string;
  title: string;
  startAt?: string | null;
  status?: string;
  format?: string | null;
  registrationCount?: number | null;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const timeText = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/** "Today · 6:30 pm", "Tomorrow · 10 am", "Sat, 21 Nov · 9 am", or a past date. */
function whenText(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  if (dayKey(d) === dayKey(today)) return `Today · ${timeText(d)}`;
  if (dayKey(d) === dayKey(tomorrow)) return `Tomorrow · ${timeText(d)}`;
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }) + ` · ${timeText(d)}`;
}

/** Today's events first (the door is open now), then upcoming soonest first, then past ones latest first. */
function groupEvents(events: PickerEvent[]) {
  const now = new Date();
  const todayKey = dayKey(now);
  const today: PickerEvent[] = [], upcoming: PickerEvent[] = [], past: PickerEvent[] = [];
  for (const e of events) {
    const d = e.startAt ? new Date(e.startAt) : null;
    if (d && dayKey(d) === todayKey) today.push(e);
    else if (d && d > now) upcoming.push(e);
    else past.push(e);
  }
  const t = (e: PickerEvent) => (e.startAt ? new Date(e.startAt).getTime() : 0);
  today.sort((a, b) => t(a) - t(b));
  upcoming.sort((a, b) => t(a) - t(b));
  past.sort((a, b) => t(b) - t(a));
  return [
    { label: "Today", items: today },
    { label: "Upcoming", items: upcoming },
    { label: "Past", items: past },
  ].filter((g) => g.items.length);
}

function DateTile({ iso, active }: { iso?: string | null; active?: boolean }) {
  if (!iso) {
    return (
      <span className="w-11 h-11 shrink-0 rounded-[10px] bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <CalendarDays className="w-5 h-5 text-gray-400" aria-hidden />
      </span>
    );
  }
  const d = new Date(iso);
  return (
    <span aria-hidden className={`w-11 h-11 shrink-0 rounded-[10px] flex flex-col items-center justify-center leading-none ${active ? "bg-[#A50F15] text-white" : "bg-red-50 text-[#A50F15] dark:bg-red-500/15 dark:text-red-300"}`}>
      <span className="text-[10px] font-bold uppercase tracking-wide">{d.toLocaleDateString("en-IN", { month: "short" })}</span>
      <span className="text-base font-extrabold font-sora mt-0.5">{d.getDate()}</span>
    </span>
  );
}

function meta(e: PickerEvent) {
  return [whenText(e.startAt), e.registrationCount != null ? `${e.registrationCount.toLocaleString("en-IN")} registered` : ""].filter(Boolean).join(" · ");
}

/**
 * The check-in page's event picker: the chosen event as a card (date, name, time, registrations).
 * Opens a bottom sheet on phones and a dropdown panel on bigger screens, grouped into Today, Upcoming and Past.
 */
export default function CheckInEventPicker({ events, value, onChange }: { events: PickerEvent[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isPhone, setIsPhone] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = events.find((e) => e.id === value);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Desktop panel: close on an outside click or Escape.
  useEffect(() => {
    if (!open || isPhone) return;
    const onDown = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, isPhone]);

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groupEvents(q ? events.filter((e) => e.title.toLowerCase().includes(q)) : events);
  }, [events, query]);

  const pick = (id: string) => { onChange(id); setOpen(false); };

  const list = (
    <div className="flex flex-col">
      {events.length > 6 && (
        <div className="relative px-3 pt-1 pb-2">
          <Search className="absolute left-6 top-[calc(50%-2px)] -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search events" aria-label="Search events"
            autoComplete="off" enterKeyHint="search"
            className="w-full h-10 pl-9 pr-3 rounded-[10px] border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-base sm:text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-gray-400" />
        </div>
      )}
      {groups.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {events.length ? "No events match." : "No published events yet. Publish an event to check people in."}
        </p>
      )}
      {groups.map((g) => (
        <div key={g.label} role="group" aria-label={g.label} className="pb-1">
          <p className="px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">{g.label}</p>
          <ul>
            {g.items.map((e) => {
              const on = e.id === value;
              return (
                <li key={e.id}>
                  <button type="button" role="option" aria-selected={on} onClick={() => pick(e.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-[12px] transition-colors ${on ? "bg-red-50/70 dark:bg-red-500/10" : "hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800"}`}>
                    <DateTile iso={e.startAt} active={on} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] sm:text-sm font-semibold text-gray-900 dark:text-white truncate">{e.title}</span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{meta(e)}</span>
                    </span>
                    {on && <Check className="w-5 h-5 text-[#A50F15] dark:text-red-300 shrink-0" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );

  return (
    <div ref={wrapRef} className="relative" data-tour="checkin-event">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        aria-label={selected ? `Event: ${selected.title}. Change event` : "Choose an event"}
        className={`w-full flex items-center gap-3 p-2 pr-3 rounded-[14px] border bg-white dark:bg-gray-900 text-left transition-colors ${open ? "border-gray-400 dark:border-gray-500 ring-2 ring-brand/10" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"}`}>
        <DateTile iso={selected?.startAt} />
        <span className="min-w-0 flex-1">
          {selected ? (
            <>
              <span className="block text-[15px] sm:text-sm font-semibold text-gray-900 dark:text-white truncate">{selected.title}</span>
              <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 truncate">
                {whenText(selected.startAt)}
                {selected.registrationCount != null && <><span aria-hidden>·</span><Users className="w-3 h-3 shrink-0" aria-hidden />{selected.registrationCount.toLocaleString("en-IN")}</>}
              </span>
            </>
          ) : (
            <>
              <span className="block text-[15px] sm:text-sm font-semibold text-gray-900 dark:text-white">Choose an event</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">Tap to pick today’s event</span>
            </>
          )}
        </span>
        <ChevronDown className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${open && !isPhone ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {isPhone ? (
        <BottomSheet open={open} onClose={() => setOpen(false)} title="Choose an event">
          <div role="listbox" aria-label="Events" className="-mx-1">{list}</div>
        </BottomSheet>
      ) : open && (
        <div role="listbox" aria-label="Events"
          className="absolute left-0 right-0 top-full mt-2 z-dropdown max-h-[420px] overflow-y-auto overscroll-contain rounded-[14px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl p-1.5 animate-fade-in">
          {list}
        </div>
      )}
    </div>
  );
}

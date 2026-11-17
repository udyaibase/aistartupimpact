"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { QrCode, Search, Loader2, CheckCircle, AlertTriangle, XCircle, RotateCcw, Camera, Keyboard, CloudDownload, CloudUpload, WifiOff, IdCard } from "lucide-react";
import { BLOCKED_STATUSES, findInRoster, parseScanValue, searchRoster, type RosterRow } from "@/lib/events/checkin-rules";
import { getRoster, saveRoster, queueScan, pendingScans, removeScans, pruneRosters, type Roster } from "@/lib/events/offline-checkin-store";

const TITLES: Record<string, string> = {
  CHECKED_IN: "Checked in",
  ALREADY_CHECKED_IN: "Already checked in",
  NOT_FOUND: "No matching registration",
  CANCELLED: "Registration cancelled",
  WAITLISTED: "On the waitlist, not confirmed",
  UNPAID: "Ticket not paid yet",
  PENDING_APPROVAL: "Registration pending approval",
};
const BLOCKED_CODE: Record<string, string> = { CANCELLED: "CANCELLED", WAITLISTED: "WAITLISTED", PENDING_PAYMENT: "UNPAID", PENDING_APPROVAL: "PENDING_APPROVAL" };
const asAttendee = (r: RosterRow, status: string) => ({ id: r.id, guestName: r.name, guestEmail: r.emailHint, guestCompany: r.company, guestOccupation: r.occupation, ticketTier: r.tier ? { name: r.tier } : null, status });
const timeText = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

export default function CheckInPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [stats, setStats] = useState({ checkedIn: 0, scans: 0 });
  const [recentScans, setRecentScans] = useState<any[]>([]);
  const [mode, setMode] = useState<"manual" | "camera">("manual");
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<any>(null);
  // Offline list for this event (kept on this device) and scans waiting to upload.
  const [roster, setRoster] = useState<Roster | null>(null);
  const [pending, setPending] = useState(0);
  const [offlineBusy, setOfflineBusy] = useState<"" | "download" | "sync">("");
  const [offlineNote, setOfflineNote] = useState("");
  const [online, setOnline] = useState(true);
  const rosterRef = useRef<Roster | null>(null);
  rosterRef.current = roster;

  useEffect(() => {
    fetch("/api/organizer/events").then(r => r.json()).then(d => {
      if (d.success) setEvents(d.events || []);
    });
  }, []);

  // Camera QR scanning
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
        // Start scanning frames
        scanIntervalRef.current = setInterval(scanFrame, 500);
      }
    } catch (err) {
      setResult({ status: "ERROR", message: "Camera access denied. Use manual input." });
      setMode("manual");
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    setCameraActive(false);
  };

  const scanFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    // Use BarcodeDetector if available (Chrome 88+, mobile browsers)
    if ("BarcodeDetector" in window) {
      const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
      detector.detect(canvas).then((barcodes: any[]) => {
        if (barcodes.length > 0) {
          const code = barcodes[0].rawValue;
          // Extract token from URL or use as-is
          const token = parseScanValue(code);
          if (token && token !== input) {
            setInput(token);
            doCheckIn(token);
          }
        }
      }).catch(() => {});
    }
  };

  useEffect(() => {
    if (mode === "camera" && selectedEvent) startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [mode, selectedEvent]);

  // ── Offline list ──
  const refreshPending = useCallback(async (eventId: string) => {
    try { setPending((await pendingScans(eventId)).length); } catch { setPending(0); }
  }, []);

  // Who is signed in: a list saved by someone else on this device isn't shown to them, and is removed.
  const [personId, setPersonId] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/organizer/auth/session").then((r) => r.json()).then((d) => setPersonId(typeof d?.organizer?.id === "string" ? d.organizer.id : null)).catch(() => {});
  }, []);

  useEffect(() => {
    setRoster(null); setPending(0); setOfflineNote("");
    if (!selectedEvent || !personId) return;
    // Lists are deleted a day after their event ends, and when saved by someone else.
    pruneRosters(personId)
      .then(() => getRoster(selectedEvent))
      .then((r) => setRoster(r ?? null))
      .catch(() => {});
    refreshPending(selectedEvent);
  }, [selectedEvent, refreshPending, personId]);

  /** Remember a status change in the offline list too, so a later offline scan of the same ticket is caught. */
  const markInRoster = (id: string, status: string, checkedInAt: string | null) => {
    const r = rosterRef.current;
    if (!r) return;
    const next = { ...r, rows: r.rows.map((x) => (x.id === id ? { ...x, status, checkedInAt } : x)) };
    setRoster(next);
    saveRoster(next).catch(() => {});
  };

  const downloadList = async () => {
    if (!selectedEvent) return;
    setOfflineBusy("download"); setOfflineNote("");
    try {
      const res = await fetch(`/api/organizer/check-in/roster?eventId=${encodeURIComponent(selectedEvent)}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) { setOfflineNote(d.error || "Couldn’t download the list."); return; }
      // Scans not yet uploaded stay checked in on this device.
      const waiting = new Set((await pendingScans(selectedEvent)).map((p) => p.registrationId));
      const rows: RosterRow[] = d.rows.map((r: RosterRow) => (waiting.has(r.id) && r.status === "CONFIRMED" ? { ...r, status: "CHECKED_IN" } : r));
      const next: Roster = { eventId: selectedEvent, title: d.event.title, downloadedAt: d.downloadedAt, rows, keepUntil: d.keepUntil, downloadedBy: d.downloadedBy };
      await saveRoster(next);
      setRoster(next);
      setOfflineNote(`${rows.length.toLocaleString("en-IN")} people saved on this device. Check-in keeps working without internet.`);
    } catch { setOfflineNote("You seem to be offline. Download the list while you have a connection."); }
    finally { setOfflineBusy(""); }
  };

  const syncNow = useCallback(async () => {
    if (!selectedEvent || offlineBusy) return;
    const scans = await pendingScans(selectedEvent).catch(() => []);
    if (!scans.length) return;
    setOfflineBusy("sync");
    try {
      for (let i = 0; i < scans.length; i += 500) {
        const batch = scans.slice(i, i + 500);
        const res = await fetch("/api/organizer/check-in/sync", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: selectedEvent, scans: batch.map((b) => ({ registrationId: b.registrationId, scannedAt: b.scannedAt })) }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || !d.success) { setOfflineNote(d.error || "Couldn’t upload scans. They’re kept on this device."); break; }
        const blocked = (d.results as { status: string }[]).filter((r) => r.status === "BLOCKED" || r.status === "NOT_FOUND").length;
        if (blocked) setOfflineNote(`${blocked} offline ${blocked === 1 ? "scan was" : "scans were"} not accepted (the registration changed while you were offline).`);
        await removeScans(batch.map((b) => b.key));
      }
    } catch { /* still offline: keep the scans */ }
    finally { setOfflineBusy(""); refreshPending(selectedEvent); }
  }, [selectedEvent, offlineBusy, refreshPending]);

  // Upload automatically when the connection comes back, and every 30 seconds while scans are waiting.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    const back = () => { update(); syncNow(); };
    window.addEventListener("online", back);
    window.addEventListener("offline", update);
    const t = setInterval(() => { if (navigator.onLine && pending) syncNow(); }, 30_000);
    return () => { window.removeEventListener("online", back); window.removeEventListener("offline", update); clearInterval(t); };
  }, [syncNow, pending]);

  /** Check in from the list on this device. */
  const localCheckIn = async (value: string, registrationId?: string) => {
    const r = rosterRef.current;
    if (!r) return { success: false, status: "ERROR", message: "You’re offline and this event’s list isn’t on this device." };
    const row = registrationId ? r.rows.find((x) => x.id === registrationId) ?? null : await findInRoster(r.rows, r.eventId, parseScanValue(value));
    if (!row) {
      // A name only searches: the right person is picked from the list, never admitted on a partial match.
      const matches = registrationId ? [] : searchRoster(r.rows, value);
      if (matches.length) return { success: false, status: "CHOOSE", message: matches.length === 1 ? "Is this the person? Tap to check in." : "More than one match. Tap the right person.", matches: matches.map((m) => asAttendee(m, m.status)) };
      return { success: false, status: "NOT_FOUND", message: "No registration found" };
    }
    if (row.status === "CHECKED_IN") return { success: false, status: "ALREADY_CHECKED_IN", message: `Already checked in${row.checkedInAt ? ` at ${timeText(row.checkedInAt)}` : ""}`, attendee: asAttendee(row, "CHECKED_IN") };
    if (BLOCKED_STATUSES[row.status]) return { success: false, status: BLOCKED_CODE[row.status] ?? "ERROR", message: BLOCKED_STATUSES[row.status], attendee: asAttendee(row, row.status) };
    const at = new Date().toISOString();
    await queueScan(r.eventId, row.id, at);
    markInRoster(row.id, "CHECKED_IN", at);
    refreshPending(r.eventId);
    return { success: true, status: "CHECKED_IN", offline: true, message: "Checked in on this device", attendee: asAttendee(row, "CHECKED_IN") };
  };

  const doCheckIn = async (value?: string, registrationId?: string) => {
    const searchValue = value || input.trim();
    if (!selectedEvent || (!searchValue && !registrationId)) return;
    setLoading(true); setResult(null);
    let d: any;
    if (typeof navigator !== "undefined" && !navigator.onLine) d = await localCheckIn(searchValue, registrationId);
    else {
      try {
        const res = await fetch("/api/organizer/check-in", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: selectedEvent, input: searchValue, registrationId }),
        });
        d = await res.json();
        if (d.attendee?.id && (d.status === "CHECKED_IN" || d.status === "ALREADY_CHECKED_IN")) markInRoster(d.attendee.id, "CHECKED_IN", d.attendee.checkedInAt ?? new Date().toISOString());
      } catch {
        // Signal dropped mid-request: fall back to the list on this device.
        d = await localCheckIn(searchValue, registrationId);
      }
    }
    setResult(d);
    // A list to pick from isn't a scan yet.
    if (d.status === "CHOOSE") { setLoading(false); return; }
    setStats(s => ({ ...s, scans: s.scans + 1 }));
    if (d.attendee) setRecentScans(prev => [{ ...d.attendee, scanStatus: d.status, offline: !!d.offline, time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) }, ...prev].slice(0, 20));
    if (d.success) { setStats(s => ({ ...s, checkedIn: s.checkedIn + 1 })); setInput(""); }
    setLoading(false);
  };

  const handleUndo = async (attendee: any) => {
    if (attendee.offline) {
      // Not uploaded yet: just drop it from this device.
      await removeScans([`${selectedEvent}:${attendee.id}`]).catch(() => {});
      markInRoster(attendee.id, "CONFIRMED", null);
      refreshPending(selectedEvent);
      setStats(s => ({ ...s, checkedIn: Math.max(0, s.checkedIn - 1) }));
      setRecentScans(prev => prev.filter(s => s.id !== attendee.id));
      return;
    }
    const res = await fetch("/api/organizer/check-in", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: selectedEvent, input: attendee.guestEmail, registrationId: attendee.id, action: "undo" }),
    });
    const d = await res.json();
    if (d.success) { markInRoster(attendee.id, "CONFIRMED", null); setStats(s => ({ ...s, checkedIn: Math.max(0, s.checkedIn - 1) })); setRecentScans(prev => prev.filter(s => s.id !== attendee.id)); }
  };

  // Haptic feedback so door staff don't need to look at the screen.
  useEffect(() => {
    if (!result || typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    navigator.vibrate(result.status === "CHECKED_IN" ? 40 : [60, 50, 60]);
  }, [result]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="portal-title flex items-center gap-2"><QrCode className="w-5 h-5 text-brand"/> Check-In</h1>
          <p className="portal-subtitle">Scan QR or search to check in attendees</p>
        </div>
        {/* Mode Toggle */}
        {selectedEvent && (
          <div data-tour="checkin-mode" role="radiogroup" aria-label="Check-in mode" className="grid grid-cols-2 sm:flex sm:items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button role="radio" aria-checked={mode === "manual"} onClick={() => setMode("manual")} className={`min-h-[44px] px-4 rounded-md text-sm font-jakarta font-semibold transition-colors flex items-center justify-center gap-1.5 ${mode === "manual" ? "bg-white dark:bg-gray-700 shadow-sm text-gray-700 dark:text-white" : "text-gray-500"}`}>
              <Keyboard className="w-4 h-4"/> Manual
            </button>
            <button role="radio" aria-checked={mode === "camera"} onClick={() => setMode("camera")} className={`min-h-[44px] px-4 rounded-md text-sm font-jakarta font-semibold transition-colors flex items-center justify-center gap-1.5 ${mode === "camera" ? "bg-white dark:bg-gray-700 shadow-sm text-gray-700 dark:text-white" : "text-gray-500"}`}>
              <Camera className="w-4 h-4"/> Camera
            </button>
          </div>
        )}
      </div>

      {/* Event Selector */}
      <div data-tour="checkin-event" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
        <select aria-label="Event" value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)} className="w-full min-h-[48px] px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-base sm:text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/20">
          <option value="">Choose an event…</option>
          {events.map((e: any) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
      </div>

      {selectedEvent && (
        <>
          {/* Offline list */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0 text-sm font-jakarta">
              {!online && <p className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400"><WifiOff className="w-4 h-4" aria-hidden /> Offline. Checking in from the list on this device.</p>}
              {roster
                ? <p className="text-gray-600 dark:text-gray-300">Offline list: {roster.rows.length.toLocaleString("en-IN")} people, saved {timeText(roster.downloadedAt)}{pending ? <> · <strong className="text-gray-900 dark:text-white">{pending} waiting to upload</strong></> : null}</p>
                : <p className="text-gray-600 dark:text-gray-300">Weak signal at the venue? Save the list on this device so check-in works offline.</p>}
              {offlineNote && <p role="status" className="mt-1 text-xs text-gray-500">{offlineNote}</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              {pending > 0 && online && (
                <button onClick={syncNow} disabled={!!offlineBusy} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold font-jakarta disabled:opacity-50">
                  {offlineBusy === "sync" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CloudUpload className="w-4 h-4" aria-hidden />} Upload
                </button>
              )}
              <button onClick={downloadList} disabled={!!offlineBusy || !online} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 font-jakarta disabled:opacity-50">
                {offlineBusy === "download" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CloudDownload className="w-4 h-4" aria-hidden />} {roster ? "Refresh list" : "Save list offline"}
              </button>
            </div>
          </div>

          {/* Camera Mode */}
          {mode === "camera" && (
            <div className="bg-black rounded-xl overflow-hidden relative">
              <video ref={videoRef} className="w-full aspect-[4/3] object-cover" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              {/* Scanning overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-2 border-white/50 rounded-2xl relative">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-brand rounded-tl-lg"/>
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-brand rounded-tr-lg"/>
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-brand rounded-bl-lg"/>
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-brand rounded-br-lg"/>
                </div>
              </div>
              {!cameraActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
                  <p className="text-white text-sm font-jakarta">Starting camera...</p>
                </div>
              )}
            </div>
          )}

          {/* Manual Mode */}
          {mode === "manual" && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"/>
                  <input
                    data-tour="checkin-search"
                    aria-label="Phone, name or email"
                    inputMode="search"
                    enterKeyHint="go"
                    autoComplete="off"
                    value={input}
                    onChange={e => { setInput(e.target.value); setResult(null); }}
                    onKeyDown={e => e.key === "Enter" && doCheckIn()}
                    placeholder="Phone, name or email"
                    className="w-full min-h-[48px] pl-9 pr-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-base sm:text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/20"
                    autoFocus
                  />
                </div>
                <button onClick={() => doCheckIn()} disabled={loading || !input.trim()} className="min-h-[48px] px-4 bg-brand hover:bg-brand-600 active:bg-brand-700 text-white font-bold text-sm font-jakarta rounded-lg disabled:opacity-40 flex items-center gap-1.5 shrink-0">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4"/>}
                  <span>Check in</span>
                </button>
              </div>
            </div>
          )}

          {/* Name search: pick the person */}
          {result?.status === "CHOOSE" && (
            <div role="status" aria-live="polite" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta mb-2">{result.message}</p>
              <ul className="space-y-2">
                {(result.matches ?? []).map((m: any) => (
                  <li key={m.id}>
                    <button type="button" disabled={loading || m.status === "CHECKED_IN"} onClick={() => doCheckIn(m.guestName || "", m.id)}
                      className="w-full min-h-[48px] px-3 py-2 text-left rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60 font-jakarta">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-white">{m.guestName}{m.status === "CHECKED_IN" ? " · already checked in" : ""}</span>
                      <span className="block text-xs text-gray-500">{[m.guestEmail, m.guestCompany, m.ticketTier?.name].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Result */}
          {result && result.status !== "CHOOSE" && (
            <div role="status" aria-live="assertive" className={`p-4 rounded-xl flex items-start gap-3 ${
              result.status === "CHECKED_IN" ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/30" :
              result.status === "ALREADY_CHECKED_IN" ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/30" :
              "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30"
            }`}>
              {result.status === "CHECKED_IN" && <CheckCircle className="w-6 h-6 text-green-600 shrink-0"/>}
              {result.status === "ALREADY_CHECKED_IN" && <AlertTriangle className="w-6 h-6 text-yellow-600 shrink-0"/>}
              {!["CHECKED_IN","ALREADY_CHECKED_IN"].includes(result.status) && <XCircle className="w-6 h-6 text-red-600 shrink-0"/>}
              <div className="flex-1">
                <p className={`text-base font-bold font-jakarta ${result.status === "CHECKED_IN" ? "text-green-700" : result.status === "ALREADY_CHECKED_IN" ? "text-yellow-700" : "text-red-700"}`}>
                  {TITLES[result.status] ?? result.message ?? "Something went wrong"}
                  {result.offline && <span className="ml-2 text-xs font-semibold text-gray-500">(saved on this device)</span>}
                </p>
                {result.attendee && (
                  <div className="mt-1">
                    <p className="text-sm text-gray-700 dark:text-gray-200 font-jakarta font-medium">{result.attendee.guestName}</p>
                    <p className="text-xs text-gray-500 font-jakarta">{[result.attendee.guestCompany, result.attendee.guestOccupation, result.attendee.ticketTier?.name].filter(Boolean).join(" · ")}</p>
                    {result.status === "CHECKED_IN" && online && result.attendee.id && (
                      <a href={`/api/organizer/events/${selectedEvent}/badges?layout=label&registrationId=${encodeURIComponent(result.attendee.id)}`} target="_blank" rel="noopener"
                        className="mt-2 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 font-jakarta">
                        <IdCard className="w-4 h-4" aria-hidden /> Print badge
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center border border-green-100 dark:border-green-900/20">
              <p className="text-2xl font-sora font-extrabold text-green-600">{stats.checkedIn}</p>
              <p className="text-xs text-green-600/70 font-jakarta">Checked In</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center border border-gray-200 dark:border-gray-700">
              <p className="text-2xl font-sora font-extrabold text-gray-500">{stats.scans}</p>
              <p className="text-xs text-gray-500 font-jakarta">Total Scans</p>
            </div>
          </div>

          {/* Recent */}
          {recentScans.length > 0 && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <p className="px-4 py-2 text-xs font-bold text-gray-400 uppercase font-jakarta border-b border-gray-100 dark:border-gray-800">Recent</p>
              <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-72 overflow-y-auto overscroll-contain">
                {recentScans.map((s, i) => (
                  <div key={i} className="px-4 py-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${s.scanStatus === "CHECKED_IN" ? "bg-green-500" : s.scanStatus === "ALREADY_CHECKED_IN" ? "bg-yellow-500" : "bg-red-500"}`}/>
                      <div className="min-w-0"><p className="text-sm text-gray-800 dark:text-gray-200 font-jakarta truncate">{s.guestName}</p><p className="text-xs text-gray-400">{s.time}</p></div>
                    </div>
                    {s.scanStatus === "CHECKED_IN" && <button onClick={() => handleUndo(s)} aria-label={`Undo check-in for ${s.guestName}`} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg text-sm text-gray-500 hover:text-red-600 active:bg-gray-100 dark:active:bg-gray-800 font-jakarta"><RotateCcw className="w-4 h-4"/> Undo</button>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

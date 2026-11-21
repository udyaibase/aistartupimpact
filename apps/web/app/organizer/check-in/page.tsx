"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { QrCode, Search, Loader2, CheckCircle, AlertTriangle, XCircle, RotateCcw, Camera, Keyboard, X, Flashlight, FlashlightOff, CloudDownload, CloudUpload, WifiOff, IdCard } from "lucide-react";
import { BLOCKED_STATUSES, findInRoster, parseScanValue, searchRoster, type RosterRow } from "@/lib/events/checkin-rules";
import CheckInEventPicker from "@/components/organizer/CheckInEventPicker";
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
  // jsQR, loaded only on browsers without a built-in QR reader.
  const jsQRRef = useRef<null | ((data: Uint8ClampedArray, width: number, height: number, options?: { inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst" }) => { data: string } | null)>(null);
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
      // Only events with a door to work: drafts, events waiting for review and cancelled ones have no one to admit.
      if (d.success) setEvents((d.events || []).filter((e: any) => e.status === "PUBLISHED" || e.status === "COMPLETED"));
    });
  }, []);

  // ── Camera QR scanning ──
  // The camera starts from a tap (phones, and installed apps in particular, only show the permission prompt for a tap).
  // A code is read once: while the same code stays in front of the camera it is ignored, so one ticket is never
  // checked in over and over. Scanning pauses briefly after each result so the result can be read.
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const scanBusyRef = useRef(false);
  const pauseUntilRef = useRef(0);
  const lastCodeRef = useRef<{ token: string; seen: number }>({ token: "", seen: 0 });
  const checkInRef = useRef<(value?: string, registrationId?: string) => Promise<any>>(async () => null);
  const [camState, setCamState] = useState<"idle" | "starting" | "on" | "blocked" | "error">("idle");
  const [camError, setCamError] = useState("");
  const [scanResult, setScanResult] = useState<any>(null);
  const [flash, setFlash] = useState("");   // the scan window's colour for a moment after each result
  const flashTimer = useRef<any>(null);

  const isIOS = () => typeof navigator !== "undefined" && !/Android/i.test(navigator.userAgent) && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  const isInstalled = () => typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true);
  const blockedHelp = () => isIOS()
    ? ["Open the iPhone Settings app", "Go to Apps › Safari › Camera (home-screen apps use Safari’s setting)", "Choose Allow, then come back here"]
    : isInstalled()
      ? ["Long-press the Udyaibase app icon and tap App info", "Open Permissions (or Site settings) › Camera", "Choose Allow, then come back here"]
      : ["Tap the icon at the left of the address bar", "Open Permissions › Camera", "Choose Allow, then come back here"];

  // Newer Chrome has its own "Use camera" button (<camera>, or the older <usermedia>) that can turn a blocked camera
  // back on right here, without a trip to the phone's settings. Other browsers get the written steps instead.
  const [reallowTag, setReallowTag] = useState<"" | "camera" | "usermedia">("");
  useEffect(() => {
    setReallowTag("HTMLCameraElement" in window ? "camera" : "HTMLUserMediaElement" in window ? "usermedia" : "");
  }, []);
  const reallowRef = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const ctrl = el as HTMLElement & { stream?: MediaStream; track?: MediaStreamTrack; setConstraints?: (c: object) => void };
    const back = { facingMode: { ideal: "environment" } };
    try { ctrl.setConstraints?.(el.tagName === "CAMERA" ? back : { video: back }); } catch { /* defaults are fine */ }
    const go = (stream?: MediaStream | null) => { if (stream && !streamRef.current) { setCamState("starting"); beginScanning(stream); } };
    el.addEventListener("track", () => go(ctrl.track ? new MediaStream([ctrl.track]) : null));
    el.addEventListener("stream", () => go(ctrl.stream));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phones get a full-screen scanner (like a native app); tablets and computers keep it inside the page.
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const fullscreen = isPhone && mode === "camera";

  // Torch, on phones whose camera has one (dark venues).
  const [torch, setTorch] = useState<null | boolean>(null);   // null: no torch
  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || torch === null) return;
    try { await track.applyConstraints({ advanced: [{ torch: !torch } as MediaTrackConstraintSet] }); setTorch(!torch); } catch { setTorch(null); }
  };

  // Keep the screen on while scanning, so the phone doesn't lock between guests.
  const wakeRef = useRef<any>(null);
  useEffect(() => {
    if (!cameraActive) return;
    let gone = false;
    const lock = async () => {
      try { if (!gone && document.visibilityState === "visible" && "wakeLock" in navigator) wakeRef.current = await (navigator as any).wakeLock.request("screen"); } catch { /* not allowed: fine */ }
    };
    lock();
    document.addEventListener("visibilitychange", lock);
    return () => { gone = true; document.removeEventListener("visibilitychange", lock); wakeRef.current?.release?.().catch?.(() => {}); wakeRef.current = null; };
  }, [cameraActive]);

  // Full-screen scanner: the page behind it doesn't scroll.
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [fullscreen]);

  const stopCamera = useCallback(() => {
    setTorch(null);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
    setCameraActive(false);
    setCamState(s => (s === "on" || s === "starting" ? "idle" : s));
  }, []);

  const startCamera = async () => {
    if (streamRef.current) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCamState("error"); setCamError("This browser can’t open the camera here. Open the check-in page in Chrome or Safari, or switch to Manual and type the ticket code.");
      return;
    }
    setCamState("starting"); setCamError("");
    let stream: MediaStream;
    try {
      // Asked first, straight from the tap, so the phone shows its permission prompt.
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") { setCamState("blocked"); return; }
      setCamState("error");
      setCamError(name === "NotFoundError" || name === "OverconstrainedError" ? "No camera was found on this device. Switch to Manual to type the ticket code or search by name."
        : name === "NotReadableError" || name === "AbortError" ? "The camera is being used by another app. Close it, then tap Try again."
        : "The camera couldn’t start. Tap Try again, or switch to Manual.");
      return;
    }
    await beginScanning(stream);
  };

  /** Start reading QR codes from a camera stream (from getUserMedia, or from the browser's allow-camera button). */
  const beginScanning = async (stream: MediaStream) => {
    // Safari (iPhone, iPad) has no built-in QR reader: load the small jsQR reader.
    if (!("BarcodeDetector" in window) && !jsQRRef.current) {
      try { jsQRRef.current = (await import("jsqr")).default; }
      catch { stream.getTracks().forEach(t => t.stop()); setCamState("error"); setCamError("The QR reader couldn’t load. Check your connection, then tap Try again."); return; }
    }
    if ("BarcodeDetector" in window && !detectorRef.current) {
      try { detectorRef.current = new (window as any).BarcodeDetector({ formats: ["qr_code"] }); } catch { /* falls back below */ }
    }
    streamRef.current = stream;
    try { setTorch((stream.getVideoTracks()[0]?.getCapabilities?.() as any)?.torch ? false : null); } catch { setTorch(null); }
    lastCodeRef.current = { token: "", seen: 0 };
    setScanResult(null);
    setCameraActive(true);
    setCamState("on");
  };

  // Attach the stream once the video element is on screen, and read frames.
  useEffect(() => {
    if (!cameraActive || mode !== "camera") return;
    const video = videoRef.current;
    if (!video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    video.play().catch(() => {});
    scanIntervalRef.current = setInterval(scanFrame, 250);
    return () => { if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraActive, mode, fullscreen]);

  const onCode = (code: string) => {
    const token = parseScanValue(code);
    if (!token) return;
    const now = Date.now();
    const last = lastCodeRef.current;
    // Same code still in front of the camera: ignore it (it must be out of view for 2.5s before it counts again).
    if (token === last.token && now - last.seen < 2500) { last.seen = now; return; }
    if (scanBusyRef.current || now < pauseUntilRef.current) return;
    lastCodeRef.current = { token, seen: now };
    scanBusyRef.current = true;
    checkInRef.current(token)
      .then((d) => {
        if (!d) return;
        setScanResult(d);
        setFlash(d.status);
        clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(""), 900);
      })
      .finally(() => {
        scanBusyRef.current = false;
        pauseUntilRef.current = Date.now() + 1200;
        // A slow answer mustn't make the same ticket, still in view, look new.
        if (lastCodeRef.current.token === token) lastCodeRef.current.seen = Date.now();
      });
  };

  const scanFrame = () => {
    const video = videoRef.current, canvas = canvasRef.current;
    // Frames are read even while a check-in is running, so a ticket that stays in view keeps being recognised (and ignored).
    if (!video || !canvas) return;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    // At most 800px wide: plenty for a ticket QR, and keeps reading fast on older phones.
    const scale = Math.min(1, 800 / (video.videoWidth || 800));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (detectorRef.current) {
      detectorRef.current.detect(canvas).then((codes: any[]) => { if (codes.length) onCode(codes[0].rawValue); }).catch(() => {});
      return;
    }
    const read = jsQRRef.current;
    if (!read) return;
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hit = read(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" });
    if (hit?.data) onCode(hit.data);
  };

  // Leaving camera mode (or the page) turns the camera off.
  useEffect(() => { if (mode !== "camera") stopCamera(); }, [mode, stopCamera]);
  useEffect(() => () => stopCamera(), [stopCamera]);

  // Camera blocked: start by itself as soon as access is allowed in settings (no refresh needed).
  useEffect(() => {
    if (mode !== "camera" || camState !== "blocked") return;
    let status: PermissionStatus | null = null;
    let gone = false;
    const retry = () => { if (!gone && document.visibilityState === "visible") startCamera(); };
    const check = async () => {
      try {
        const p = await navigator.permissions?.query({ name: "camera" as PermissionName });
        if (p && p.state !== "denied") retry();
      } catch { /* the browser can't tell: wait for Try again */ }
    };
    navigator.permissions?.query({ name: "camera" as PermissionName }).then((p) => {
      status = p;
      p.onchange = () => { if (p.state === "granted") retry(); };
    }).catch(() => {});
    document.addEventListener("visibilitychange", check);
    return () => { gone = true; if (status) status.onchange = null; document.removeEventListener("visibilitychange", check); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, camState]);

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
    if (!selectedEvent || (!searchValue && !registrationId)) return null;
    setLoading(true);
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
    if (d.status === "CHOOSE") { setLoading(false); return d; }
    setStats(s => ({ ...s, scans: s.scans + 1 }));
    if (d.attendee) setRecentScans(prev => [{ ...d.attendee, scanStatus: d.status, offline: !!d.offline, time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) }, ...prev.filter(s => s.id !== d.attendee.id)].slice(0, 20));
    if (d.success) { setStats(s => ({ ...s, checkedIn: s.checkedIn + 1 })); setInput(""); }
    setLoading(false);
    return d;
  };
  checkInRef.current = doCheckIn;

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

  const eventTitle = events.find((e: any) => e.id === selectedEvent)?.title ?? "";
  const resultTone = (st?: string) => st === "CHECKED_IN" ? "bg-green-600 text-white" : st === "ALREADY_CHECKED_IN" ? "bg-amber-400 text-gray-900" : "bg-red-600 text-white";
  const frameTone = flash === "CHECKED_IN" ? "border-green-400" : flash === "ALREADY_CHECKED_IN" ? "border-amber-300" : flash ? "border-red-400" : "border-white";

  const cameraView = () => (
    <div className={fullscreen
      ? "fixed inset-0 z-modal bg-black overflow-hidden overscroll-none select-none"
      : "bg-black overflow-hidden relative rounded-xl"}>
      <video ref={videoRef} playsInline muted autoPlay
        className={`${fullscreen ? "absolute inset-0 w-full h-full" : "w-full aspect-[4/3]"} object-cover ${camState === "on" ? "" : "invisible"}`} />
      <canvas ref={canvasRef} className="hidden" />

      {camState === "on" && (
        <>
          {/* Scan window: the rest of the picture is dimmed */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className={`relative ${fullscreen ? "w-[72vw] max-w-[300px]" : "w-[55%] max-w-[260px]"} aspect-square rounded-[18px] shadow-[0_0_0_200vmax_rgba(0,0,0,0.45)] transition-transform duration-200 ${flash ? "scale-[1.03]" : ""}`}>
              {(["top-0 left-0 border-t-4 border-l-4 rounded-tl-[18px]", "top-0 right-0 border-t-4 border-r-4 rounded-tr-[18px]", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-[18px]", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-[18px]"]).map((c) => (
                <div key={c} className={`absolute w-10 h-10 ${c} ${frameTone} transition-colors duration-200`} />
              ))}
            </div>
            <p className="mt-5 px-4 py-1.5 rounded-full bg-black/45 text-white text-sm font-jakarta font-medium">
              {loading ? "Checking…" : "Point at the ticket QR code"}
            </p>
          </div>
        </>
      )}

              {camState !== "on" && (
                <div className="absolute inset-0 flex items-center justify-center p-5 pt-20 bg-gray-950 overflow-y-auto">
                  {camState === "starting" ? (
                    <p className="flex items-center gap-2 text-white text-sm font-jakarta"><Loader2 className="w-4 h-4 animate-spin" aria-hidden/> Starting camera…</p>
                  ) : camState === "blocked" ? (
                    <div className="w-full max-w-sm text-white font-jakarta">
                      <Camera className="w-8 h-8 mb-3 text-white/80" aria-hidden/>
                      <p className="text-base font-bold">Camera access is off</p>
                      {reallowTag ? (
                        <>
                          <p className="mt-1 text-sm text-white/75">Your phone blocked the camera for Udyaibase. Tap below to allow it again.</p>
                          {/* The browser's own control: it can show the allow prompt even after the camera was blocked. */}
                          <div className="mt-4">
                            {reallowTag === "camera"
                              ? <camera ref={reallowRef} className="reallow-camera" />
                              : <usermedia ref={reallowRef} className="reallow-camera" />}
                          </div>
                          <p className="mt-4 text-xs text-white/60">If that doesn’t work, turn it on in settings:</p>
                        </>
                      ) : (
                        <p className="mt-1 text-sm text-white/75">Your phone has blocked the camera for Udyaibase, so it won’t ask again. Turn it on once:</p>
                      )}
                      <ol className="mt-3 space-y-1.5 text-sm list-decimal pl-5 text-white/90">
                        {blockedHelp().map((step) => <li key={step}>{step}</li>)}
                      </ol>
                      <p className="mt-3 text-xs text-white/60">The camera starts by itself when you come back.</p>
                      <div className="mt-4 flex gap-2">
                        <button type="button" onClick={startCamera} className="min-h-[44px] px-4 rounded-[10px] bg-white text-gray-900 text-sm font-semibold">Try again</button>
                        <button type="button" onClick={() => setMode("manual")} className="min-h-[44px] px-4 rounded-[10px] border border-white/30 text-white text-sm font-semibold">Type code instead</button>
                      </div>
                    </div>
                  ) : camState === "error" ? (
                    <div className="w-full max-w-sm text-white font-jakarta text-center">
                      <p className="text-sm text-white/85">{camError}</p>
                      <button type="button" onClick={startCamera} className="mt-4 min-h-[44px] px-5 rounded-[10px] bg-white text-gray-900 text-sm font-semibold">Try again</button>
                    </div>
                  ) : (
                    <button type="button" onClick={startCamera} className="flex flex-col items-center gap-3 text-white font-jakarta">
                      <span className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center"><Camera className="w-7 h-7" aria-hidden/></span>
                      <span className="min-h-[44px] px-5 rounded-[10px] bg-brand text-white text-sm font-semibold inline-flex items-center">Start camera</span>
                    </button>
                  )}
                </div>
              )}

      {/* Top bar */}
      <div className={`absolute inset-x-0 top-0 flex items-center gap-2 px-3 ${fullscreen ? "pt-[calc(env(safe-area-inset-top)+10px)] pb-6 bg-gradient-to-b from-black/70 to-transparent" : "pt-3 justify-end"}`}>
        {fullscreen && (
          <>
            <button type="button" onClick={() => setMode("manual")} aria-label="Close scanner"
              className="shrink-0 w-11 h-11 rounded-full bg-black/45 text-white flex items-center justify-center active:bg-black/70">
              <X className="w-5 h-5" aria-hidden />
            </button>
            <div className="min-w-0 flex-1 text-center font-jakarta">
              <p className="text-white text-sm font-semibold truncate">{eventTitle}</p>
              <p className="text-white/75 text-xs">{stats.checkedIn} checked in · {stats.scans} scans</p>
            </div>
          </>
        )}
        {torch !== null ? (
          <button type="button" onClick={toggleTorch} aria-pressed={torch} aria-label={torch ? "Turn torch off" : "Turn torch on"}
            className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center ${torch ? "bg-white text-gray-900" : "bg-black/45 text-white active:bg-black/70"}`}>
            {torch ? <Flashlight className="w-5 h-5" aria-hidden /> : <FlashlightOff className="w-5 h-5" aria-hidden />}
          </button>
        ) : fullscreen && <span className="w-11 shrink-0" aria-hidden />}
      </div>

      {/* Bottom: the last result, big enough to read at arm's length, and a way to type a code */}
      <div className={`absolute inset-x-0 bottom-0 px-3 ${fullscreen ? "pb-[calc(env(safe-area-inset-bottom)+14px)] pt-10 bg-gradient-to-t from-black/75 to-transparent" : "pb-3"}`}>
        {camState === "on" && scanResult && scanResult.status !== "CHOOSE" && (
          <div role="status" aria-live="assertive" key={`${scanResult.attendee?.id ?? ""}-${scanResult.status}`}
            className={`rounded-[16px] p-4 flex items-center gap-3 shadow-xl animate-fade-in ${resultTone(scanResult.status)}`}>
            {scanResult.status === "CHECKED_IN" ? <CheckCircle className="w-10 h-10 shrink-0" aria-hidden/>
              : scanResult.status === "ALREADY_CHECKED_IN" ? <AlertTriangle className="w-10 h-10 shrink-0" aria-hidden/>
              : <XCircle className="w-10 h-10 shrink-0" aria-hidden/>}
            <div className="min-w-0 flex-1 font-jakarta">
              <p className="text-lg font-bold leading-tight">
                {scanResult.status === "ALREADY_CHECKED_IN" ? (scanResult.message || TITLES.ALREADY_CHECKED_IN) : (TITLES[scanResult.status] ?? scanResult.message ?? "Something went wrong")}
              </p>
              {scanResult.attendee && <p className="text-base font-semibold truncate opacity-95">{scanResult.attendee.guestName}</p>}
              {(scanResult.attendee?.ticketTier?.name || scanResult.offline) && (
                <p className="text-sm opacity-90 truncate">{[scanResult.attendee?.ticketTier?.name, scanResult.offline ? "Saved on this device" : ""].filter(Boolean).join(" · ")}</p>
              )}
            </div>
          </div>
        )}
        {fullscreen && camState === "on" && (
          <div className="mt-3 flex justify-center">
            <button type="button" onClick={() => setMode("manual")}
              className="min-h-[44px] px-5 rounded-full bg-white/15 backdrop-blur text-white text-sm font-semibold font-jakarta inline-flex items-center gap-2 active:bg-white/25">
              <Keyboard className="w-4 h-4" aria-hidden /> Type a code or name
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Title, with the Manual / Camera switch beside it (a small segmented control on phones) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="portal-title flex items-center gap-2 !text-lg sm:!text-xl"><QrCode className="w-5 h-5 text-brand shrink-0"/> Check-in</h1>
          <p className="portal-subtitle hidden sm:block">Scan QR or search to check in attendees</p>
        </div>
        {selectedEvent && (
          <div data-tour="checkin-mode" role="radiogroup" aria-label="Check-in mode" className="w-full sm:w-auto shrink-0 grid grid-cols-2 sm:flex sm:items-center bg-gray-100 dark:bg-gray-800 rounded-[10px] p-0.5">
            {([["manual", "Manual", Keyboard], ["camera", "Camera", Camera]] as const).map(([m, label, Icon]) => (
              <button key={m} role="radio" aria-checked={mode === m}
                onClick={() => { setMode(m); if (m === "camera") startCamera(); }}
                className={`h-10 px-3 sm:px-4 rounded-[8px] text-sm font-jakarta font-semibold transition-colors flex items-center justify-center gap-1.5 ${mode === m ? "bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}>
                <Icon className="w-4 h-4" aria-hidden/> {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Event */}
      <CheckInEventPicker events={events} value={selectedEvent} onChange={setSelectedEvent} />

      {selectedEvent && (
        <>
          {/* Camera Mode: full screen on phones, inside the page on bigger screens */}
          {mode === "camera" && (fullscreen ? createPortal(cameraView(), document.body) : cameraView())}

          {/* Manual Mode */}
          {mode === "manual" && (
            <form className="flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); doCheckIn(); }}>
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden/>
                <input
                  data-tour="checkin-search"
                  aria-label="Name, email, phone or ticket code"
                  type="search"
                  inputMode="search"
                  enterKeyHint="go"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={input}
                  onChange={e => { setInput(e.target.value); setResult(null); }}
                  placeholder="Name, email or phone"
                  className="w-full h-11 pl-9 pr-3 rounded-[10px] border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-base sm:text-sm text-gray-900 dark:text-white placeholder:text-gray-400 font-jakarta focus:outline-none focus:border-gray-400 focus:ring-2 focus:ring-brand/15"
                  autoFocus
                />
              </div>
              <button type="submit" disabled={loading || !input.trim()} aria-label="Check in"
                className="w-full sm:w-auto h-11 px-4 bg-brand hover:bg-brand-600 active:bg-brand-700 text-white font-semibold text-sm font-jakarta rounded-[10px] disabled:opacity-40 flex items-center justify-center gap-1.5 shrink-0">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden/> : <CheckCircle className="w-4 h-4" aria-hidden/>}
                <span>Check in</span>
              </button>
            </form>
          )}

          {/* Name search: pick the person */}
          {result?.status === "CHOOSE" && (
            <div role="status" aria-live="polite" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-[14px] p-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta mb-2">{result.message}</p>
              <ul className="space-y-2">
                {(result.matches ?? []).map((m: any) => (
                  <li key={m.id}>
                    <button type="button" disabled={loading || m.status === "CHECKED_IN"} onClick={() => doCheckIn(m.guestName || "", m.id)}
                      className="w-full min-h-[44px] px-3 py-2 text-left rounded-[10px] border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60 font-jakarta">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-white">{m.guestName}{m.status === "CHECKED_IN" ? " · already checked in" : ""}</span>
                      <span className="block text-xs text-gray-500">{[m.guestEmail, m.guestCompany, m.ticketTier?.name].filter(Boolean).join(" · ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Result */}
          {result && result.status !== "CHOOSE" && mode === "manual" && (
            <div role="status" aria-live="assertive" className={`p-3 sm:p-4 rounded-[14px] flex items-start gap-3 ${
              result.status === "CHECKED_IN" ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/30" :
              result.status === "ALREADY_CHECKED_IN" ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/30" :
              "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30"
            }`}>
              {result.status === "CHECKED_IN" && <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 mt-0.5 text-green-600 shrink-0"/>}
              {result.status === "ALREADY_CHECKED_IN" && <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 mt-0.5 text-yellow-600 shrink-0"/>}
              {!["CHECKED_IN","ALREADY_CHECKED_IN"].includes(result.status) && <XCircle className="w-5 h-5 sm:w-6 sm:h-6 mt-0.5 text-red-600 shrink-0"/>}
              <div className="flex-1 min-w-0">
                <p className={`text-[15px] sm:text-base font-bold font-jakarta ${result.status === "CHECKED_IN" ? "text-green-700" : result.status === "ALREADY_CHECKED_IN" ? "text-yellow-700" : "text-red-700"}`}>
                  {TITLES[result.status] ?? result.message ?? "Something went wrong"}
                  {result.offline && <span className="ml-2 text-xs font-semibold text-gray-500">(saved on this device)</span>}
                </p>
                {result.attendee && (
                  <div className="mt-1">
                    <p className="text-sm text-gray-700 dark:text-gray-200 font-jakarta font-medium">{result.attendee.guestName}</p>
                    <p className="text-xs text-gray-500 font-jakarta">{[result.attendee.guestCompany, result.attendee.guestOccupation, result.attendee.ticketTier?.name].filter(Boolean).join(" · ")}</p>
                    {result.status === "CHECKED_IN" && online && result.attendee.id && (
                      <a href={`/api/organizer/events/${selectedEvent}/badges?layout=label&registrationId=${encodeURIComponent(result.attendee.id)}`} target="_blank" rel="noopener"
                        className="mt-2 inline-flex items-center gap-1.5 h-9 px-3 rounded-[8px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 font-jakarta">
                        <IdCard className="w-4 h-4" aria-hidden /> Print badge
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Offline list */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-[14px] px-3 py-2.5 flex items-center gap-3">
            <div className="flex-1 min-w-0 text-[13px] sm:text-sm leading-snug font-jakarta">
              {!online && <p className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400"><WifiOff className="w-4 h-4" aria-hidden /> Offline. Checking in from the list on this device.</p>}
              {roster
                ? <p className="text-gray-600 dark:text-gray-300">Offline list: {roster.rows.length.toLocaleString("en-IN")} people, saved {timeText(roster.downloadedAt)}{pending ? <> · <strong className="text-gray-900 dark:text-white">{pending} waiting to upload</strong></> : null}</p>
                : <p className="text-gray-600 dark:text-gray-300"><span className="sm:hidden">Weak signal? Save the list to check in offline.</span><span className="hidden sm:inline">Weak signal at the venue? Save the list on this device so check-in works offline.</span></p>}
              {offlineNote && <p role="status" className="mt-1 text-xs text-gray-500">{offlineNote}</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              {pending > 0 && online && (
                <button onClick={syncNow} disabled={!!offlineBusy} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[8px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] sm:text-sm font-semibold font-jakarta disabled:opacity-50">
                  {offlineBusy === "sync" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CloudUpload className="w-4 h-4" aria-hidden />} Upload
                </button>
              )}
              <button onClick={downloadList} disabled={!!offlineBusy || !online} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[8px] border border-gray-300 dark:border-gray-700 text-[13px] sm:text-sm font-semibold whitespace-nowrap text-gray-800 dark:text-gray-200 font-jakarta disabled:opacity-50">
                {offlineBusy === "download" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CloudDownload className="w-4 h-4" aria-hidden />} {roster ? "Refresh" : <>Save<span className="hidden sm:inline">&nbsp;list offline</span></>}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-[14px] px-3 py-2 sm:py-3 flex items-baseline justify-center gap-2 border border-green-100 dark:border-green-900/20">
              <p className="text-xl sm:text-2xl font-sora font-extrabold text-green-700 dark:text-green-400 tabular-nums">{stats.checkedIn}</p>
              <p className="text-xs text-green-700 dark:text-green-400 font-jakarta">checked in</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-[14px] px-3 py-2 sm:py-3 flex items-baseline justify-center gap-2 border border-gray-200 dark:border-gray-700">
              <p className="text-xl sm:text-2xl font-sora font-extrabold text-gray-700 dark:text-gray-200 tabular-nums">{stats.scans}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta">scans</p>
            </div>
          </div>

          {/* Recent */}
          {recentScans.length > 0 && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-[14px] overflow-hidden">
              <p className="px-3 sm:px-4 py-2 text-xs font-bold text-gray-400 uppercase font-jakarta border-b border-gray-100 dark:border-gray-800">Recent</p>
              <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-72 overflow-y-auto overscroll-contain">
                {recentScans.map((s, i) => (
                  <div key={i} className="pl-3 pr-1 sm:px-4 py-1.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${s.scanStatus === "CHECKED_IN" ? "bg-green-500" : s.scanStatus === "ALREADY_CHECKED_IN" ? "bg-yellow-500" : "bg-red-500"}`}/>
                      <div className="min-w-0"><p className="text-sm text-gray-800 dark:text-gray-200 font-jakarta truncate">{s.guestName}</p><p className="text-xs text-gray-400">{s.time}</p></div>
                    </div>
                    {s.scanStatus === "CHECKED_IN" && <button onClick={() => handleUndo(s)} aria-label={`Undo check-in for ${s.guestName}`} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[8px] text-[13px] sm:text-sm text-gray-500 hover:text-red-600 active:bg-gray-100 dark:active:bg-gray-800 font-jakarta"><RotateCcw className="w-4 h-4"/> Undo</button>}
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

"use client";

import { useState, useEffect, useRef } from "react";
import { QrCode, Search, Loader2, CheckCircle, AlertTriangle, XCircle, RotateCcw, Camera, Keyboard } from "lucide-react";

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
          const token = code.includes("/e/") ? code.split("/e/").pop() : code.includes("token=") ? new URL(code).searchParams.get("token") : code;
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

  const doCheckIn = async (value?: string) => {
    const searchValue = value || input.trim();
    if (!selectedEvent || !searchValue) return;
    setLoading(true); setResult(null);
    const res = await fetch("/api/organizer/check-in", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: selectedEvent, input: searchValue }),
    });
    const d = await res.json();
    setResult(d);
    setStats(s => ({ ...s, scans: s.scans + 1 }));
    if (d.attendee) setRecentScans(prev => [{ ...d.attendee, scanStatus: d.status, time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) }, ...prev].slice(0, 20));
    if (d.success) { setStats(s => ({ ...s, checkedIn: s.checkedIn + 1 })); setInput(""); }
    setLoading(false);
  };

  const handleUndo = async (attendee: any) => {
    const res = await fetch("/api/organizer/check-in", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: selectedEvent, input: attendee.guestEmail, action: "undo" }),
    });
    const d = await res.json();
    if (d.success) { setStats(s => ({ ...s, checkedIn: Math.max(0, s.checkedIn - 1) })); setRecentScans(prev => prev.filter(s => s.id !== attendee.id)); }
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

          {/* Result */}
          {result && (
            <div role="status" aria-live="assertive" className={`p-4 rounded-xl flex items-start gap-3 ${
              result.status === "CHECKED_IN" ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/30" :
              result.status === "ALREADY_CHECKED_IN" ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/30" :
              "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30"
            }`}>
              {result.status === "CHECKED_IN" && <CheckCircle className="w-6 h-6 text-green-600 shrink-0"/>}
              {result.status === "ALREADY_CHECKED_IN" && <AlertTriangle className="w-6 h-6 text-yellow-600 shrink-0"/>}
              {["NOT_FOUND","CANCELLED","WAITLISTED","ERROR"].includes(result.status) && <XCircle className="w-6 h-6 text-red-600 shrink-0"/>}
              <div className="flex-1">
                <p className={`text-base font-bold font-jakarta ${result.status === "CHECKED_IN" ? "text-green-700" : result.status === "ALREADY_CHECKED_IN" ? "text-yellow-700" : "text-red-700"}`}>
                  {result.status === "CHECKED_IN" && "Checked in"}
                  {result.status === "ALREADY_CHECKED_IN" && "Already checked in"}
                  {result.status === "NOT_FOUND" && "No matching registration"}
                  {result.status === "CANCELLED" && "Registration cancelled"}
                  {result.status === "WAITLISTED" && "On the waitlist, not confirmed"}
                  {result.status === "ERROR" && result.message}
                </p>
                {result.attendee && (
                  <div className="mt-1">
                    <p className="text-sm text-gray-700 dark:text-gray-200 font-jakarta font-medium">{result.attendee.guestName}</p>
                    <p className="text-xs text-gray-500 font-jakarta">{[result.attendee.guestCompany, result.attendee.guestOccupation, result.attendee.ticketTier?.name].filter(Boolean).join(" · ")}</p>
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

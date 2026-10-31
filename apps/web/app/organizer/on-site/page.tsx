"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { QrCode, Copy, Download, Maximize, Check, Users, Loader2, UserPlus } from "lucide-react";

export default function OnSitePage() {
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Walk-in form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [registering, setRegistering] = useState(false);
  const [walkInResult, setWalkInResult] = useState<any>(null);

  const SITE_URL = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    fetch("/api/organizer/events").then(r => r.json()).then(d => { if (d.success) setEvents(d.events || []); });
  }, []);

  const eventUrl = selectedEvent ? `${SITE_URL}/events/${selectedEvent.slug}` : "";
  const qrUrl = eventUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(eventUrl)}` : "";

  const handleCopy = () => { navigator.clipboard.writeText(eventUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const handleDownloadQR = () => {
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `${selectedEvent?.slug || "event"}-qr.png`;
    a.click();
  };

  const handleWalkIn = async () => {
    if (!name || !email || !selectedEvent) return;
    setRegistering(true); setWalkInResult(null);
    const res = await fetch("/api/organizer/walk-in", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: selectedEvent.id, name, email, phone, company }),
    });
    const d = await res.json();
    setWalkInResult(d);
    if (d.success) { setName(""); setEmail(""); setPhone(""); setCompany(""); }
    setRegistering(false);
  };

  // Full screen QR
  if (fullScreen && selectedEvent) {
    return (
      <div className="fixed inset-0 z-modal bg-white dark:bg-gray-950 flex flex-col items-center justify-center p-6" onClick={() => setFullScreen(false)}>
        <Image src={qrUrl} alt="QR Code" width={384} height={384} unoptimized className="w-72 h-72 sm:w-96 sm:h-96"/>
        <p className="text-lg font-sora font-bold text-navy dark:text-white mt-6 text-center">{selectedEvent.title}</p>
        <p className="text-sm text-gray-500 font-jakarta mt-2">Scan to register</p>
        <p className="text-xs text-gray-400 font-jakarta mt-6">Tap anywhere to close</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="portal-title flex items-center gap-2"><QrCode className="w-5 h-5 text-brand"/> On-Site Registration</h1>
        <p className="portal-subtitle">Display QR for walk-ins or register attendees manually</p>
      </div>

      {/* Event Selector */}
      <select value={selectedEvent?.id || ""} onChange={e => setSelectedEvent(events.find(ev => ev.id === e.target.value) || null)} className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/20">
        <option value="">Select event...</option>
        {events.map((e: any) => <option key={e.id} value={e.id}>{e.title}</option>)}
      </select>

      {selectedEvent && (
        <>
          {/* Capacity Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-navy dark:text-white font-sora">{selectedEvent.registrationCount}</p>
              <p className="text-xs text-gray-500 font-jakarta">Registered</p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-green-600 font-sora">{selectedEvent.capacity ? selectedEvent.capacity - selectedEvent.registrationCount : "∞"}</p>
              <p className="text-xs text-gray-500 font-jakarta">Remaining</p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-gray-500 font-sora">{selectedEvent.capacity || "∞"}</p>
              <p className="text-xs text-gray-500 font-jakarta">Capacity</p>
            </div>
          </div>

          {/* QR Code Display */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 text-center">
            <p className="text-xs font-bold text-gray-400 uppercase font-jakarta mb-3">Event Registration QR</p>
            <Image src={qrUrl} alt="Registration QR" width={192} height={192} unoptimized className="w-48 h-48 mx-auto rounded-lg border border-gray-100 dark:border-gray-800"/>
            <p className="text-xs text-gray-500 font-jakarta mt-3">Visitors scan this to register on their phone</p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <button onClick={handleCopy} className="px-3 py-2 text-xs font-semibold border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 font-jakarta flex items-center gap-1.5">
                {copied ? <><Check className="w-3 h-3 text-green-500"/> Copied</> : <><Copy className="w-3 h-3"/> Copy Link</>}
              </button>
              <button onClick={handleDownloadQR} className="px-3 py-2 text-xs font-semibold border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 font-jakarta flex items-center gap-1.5">
                <Download className="w-3 h-3"/> Download
              </button>
              <button onClick={() => setFullScreen(true)} className="px-3 py-2 text-xs font-semibold border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 font-jakarta flex items-center gap-1.5">
                <Maximize className="w-3 h-3"/> Full Screen
              </button>
            </div>
          </div>

          {/* Walk-in Registration */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase font-jakarta flex items-center gap-1.5"><UserPlus className="w-3.5 h-3.5"/> Manual Walk-in Registration</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Full Name *" className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/20 col-span-2 sm:col-span-1"/>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email *" className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/20 col-span-2 sm:col-span-1"/>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/20"/>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Company" className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/20"/>
            </div>
            <button onClick={handleWalkIn} disabled={registering || !name || !email} className="w-full py-2.5 bg-brand hover:bg-brand-600 text-white font-bold text-sm font-jakarta rounded-lg disabled:opacity-40 flex items-center justify-center gap-2">
              {registering ? <Loader2 className="w-4 h-4 animate-spin"/> : <UserPlus className="w-4 h-4"/>}
              Register Attendee
            </button>

            {/* Walk-in Result */}
            {walkInResult && (
              <div className={`p-3 rounded-lg ${walkInResult.success ? "bg-green-50 dark:bg-green-900/20 border border-green-200" : "bg-red-50 dark:bg-red-900/20 border border-red-200"}`}>
                {walkInResult.success ? (
                  <div className="text-center">
                    <CheckCircleIcon />
                    <p className="text-sm font-bold text-green-700 font-jakarta mt-1">Registered & Ready!</p>
                    <Image src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(walkInResult.data?.qrToken || "")}`} alt="Ticket QR" width={96} height={96} unoptimized className="w-24 h-24 mx-auto mt-2 rounded border"/>
                    <p className="text-xs text-gray-400 font-jakarta mt-1">Ticket QR: {walkInResult.data?.qrToken}</p>
                  </div>
                ) : (
                  <p className="text-sm text-red-600 font-jakarta">{walkInResult.error}</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CheckCircleIcon() {
  return <div className="w-10 h-10 mx-auto bg-green-100 rounded-full flex items-center justify-center"><svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/></svg></div>;
}

"use client";

import { useState } from "react";
import { Users, MapPin, Briefcase, Send, Loader2, Mail, CalendarDays, Eye, Phone, MessageCircle } from "lucide-react";
import { getAudiencePreviewAction, sendCampaignAction } from "./actions";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface EventItem {
  id: string; title: string; slug: string; startAt: string;
  venueName: string | null; category: string; format: string; coverImageUrl?: string | null;
}

interface Props {
  totalCount: number;
  events: EventItem[];
  topCities: { city: string; count: number }[];
  topOccupations: { occupation: string; count: number }[];
}

export default function SubscriberDashboard({ totalCount, events, topCities, topOccupations }: Props) {
  const [selectedEventId, setSelectedEventId] = useState("");
  const [channels, setChannels] = useState({ email: true, whatsapp: false });
  const [targetCity, setTargetCity] = useState("");
  const [targetOccupation, setTargetOccupation] = useState("");
  const [subject, setSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [whatsappBody, setWhatsappBody] = useState("");
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const selectedEvent = events.find(e => e.id === selectedEventId);
  const SITE_URL = typeof window !== "undefined" ? window.location.origin.replace(":3001", ":3000") : "https://udyaibase.com";

  const handleEventSelect = (eventId: string) => {
    setSelectedEventId(eventId);
    const event = events.find(e => e.id === eventId);
    if (event) {
      const date = new Date(event.startAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      const time = new Date(event.startAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      const location = event.venueName || (event.format === "VIRTUAL" ? "Online" : "TBA");
      setSubject(`🎉 ${event.title} — Register Now!`);
      setEmailBody(`We're excited to invite you to:\n\n${event.title}\n\n📅 ${date} at ${time}\n📍 ${location}\n🏷️ ${event.category.replace(/_/g, " ")}\n\nThis event is free and spots are limited. Don't miss out!\n\nSee you there,\nUdyaibase Events`);
      setWhatsappBody(`🎉 *${event.title}*\n\n📅 ${date}\n📍 ${location}\n🏷️ ${event.category.replace(/_/g, " ")}\n\nRegister free → ${SITE_URL}/events/${event.slug}`);
    }
  };

  const previewAudience = async () => {
    setLoading(true);
    const result = await getAudiencePreviewAction({ city: targetCity || undefined, occupation: targetOccupation || undefined, eventSlug: selectedEvent?.slug });
    setAudienceCount(result.count);
    setLoading(false);
  };

  const handleSend = async () => {
    if (channels.email && (!subject || !emailBody)) { setMessage("Email subject and body required"); return; }
    if (channels.whatsapp && !whatsappBody) { setMessage("WhatsApp message required"); return; }
    setSending(true); setMessage("");
    if (channels.email) {
      const result = await sendCampaignAction({ subject, body: emailBody, city: targetCity || undefined, occupation: targetOccupation || undefined, eventSlug: selectedEvent?.slug });
      setMessage(result.success ? `✓ Email sent to ${result.count} subscribers!` : result.error || "Failed");
    }
    if (channels.whatsapp) {
      setMessage(prev => prev + (prev ? " | " : "") + "⚠ WhatsApp: API not connected yet. Connect in Settings → Integrations.");
    }
    setSending(false);
  };

  // Generate email HTML for preview
  const emailPreviewHtml = selectedEvent ? `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      ${selectedEvent.coverImageUrl ? `<img src="${escapeHtml(selectedEvent.coverImageUrl)}" style="width:100%;height:200px;object-fit:cover;" alt="" />` : `<div style="width:100%;height:120px;background:linear-gradient(135deg,#fff0f0,#ffe0e0);display:flex;align-items:center;justify-content:center;"><span style="font-size:40px;">🎉</span></div>`}
      <div style="padding:28px 24px;">
        <div style="margin-bottom:16px;"><span style="background:#fff0f0;color:#FF3131;font-size:10px;font-weight:700;text-transform:uppercase;padding:4px 10px;border-radius:20px;">${escapeHtml(selectedEvent.category.replace(/_/g, " "))}</span></div>
        <h1 style="font-size:22px;font-weight:700;color:#0D1B2A;margin:0 0 8px;line-height:1.3;">${escapeHtml(selectedEvent.title)}</h1>
        <div style="font-size:14px;color:#6b7280;line-height:1.8;white-space:pre-wrap;margin:16px 0;">${escapeHtml(emailBody)}</div>
        <div style="margin:24px 0;text-align:center;"><a href="${SITE_URL}/events/${escapeHtml(selectedEvent.slug)}" style="background:#FF3131;color:#fff;padding:14px 32px;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;display:inline-block;">Register Now →</a></div>
        <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0;" />
        <p style="font-size:11px;color:#9ca3af;text-align:center;">Udyaibase Events · <a href="#" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a></p>
      </div>
    </div>
  ` : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Promote Events</h1>
        <p className="mt-1 text-sm text-gray-500">Select event → choose channel → target audience → preview → send</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard icon={Mail} color="blue" value={totalCount} label="Email Subscribers" />
        <StatCard icon={MapPin} color="green" value={topCities.length} label="Cities" />
        <StatCard icon={CalendarDays} color="purple" value={events.length} label="Events" />
      </div>

      {/* Campaign Builder */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">

        {/* Step 1: Event */}
        <Step num={1} title="Select Event">
          <select value={selectedEventId} onChange={e => handleEventSelect(e.target.value)} className="input-field">
            <option value="">Choose an event to promote...</option>
            {events.map(e => <option key={e.id} value={e.id}>{e.title} — {new Date(e.startAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</option>)}
          </select>
        </Step>

        {/* Step 2: Channel */}
        {selectedEventId && (
          <Step num={2} title="Choose Channel">
            <div className="flex gap-3">
              <label className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border cursor-pointer transition-all ${channels.email ? "border-brand bg-brand/5" : "border-gray-200 dark:border-gray-700 hover:border-gray-300"}`}>
                <input type="checkbox" checked={channels.email} onChange={e => setChannels(p => ({...p, email: e.target.checked}))} className="w-4 h-4 rounded text-brand focus:ring-brand" />
                <Mail className={`w-4 h-4 ${channels.email ? "text-brand" : "text-gray-400"}`} />
                <span className="text-sm font-medium font-jakarta">Email</span>
              </label>
              <label className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border cursor-pointer transition-all ${channels.whatsapp ? "border-green-500 bg-green-50 dark:bg-green-900/10" : "border-gray-200 dark:border-gray-700 hover:border-gray-300"}`}>
                <input type="checkbox" checked={channels.whatsapp} onChange={e => setChannels(p => ({...p, whatsapp: e.target.checked}))} className="w-4 h-4 rounded text-green-600 focus:ring-green-500" />
                <MessageCircle className={`w-4 h-4 ${channels.whatsapp ? "text-green-600" : "text-gray-400"}`} />
                <span className="text-sm font-medium font-jakarta">WhatsApp</span>
              </label>
            </div>
          </Step>
        )}

        {/* Step 3: Audience */}
        {selectedEventId && (channels.email || channels.whatsapp) && (
          <Step num={3} title="Target Audience">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">City</label><select value={targetCity} onChange={e => { setTargetCity(e.target.value); setAudienceCount(null); }} className="input-field"><option value="">All</option>{topCities.map(c => <option key={c.city} value={c.city}>{c.city} ({c.count})</option>)}</select></div>
              <div><label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Occupation</label><select value={targetOccupation} onChange={e => { setTargetOccupation(e.target.value); setAudienceCount(null); }} className="input-field"><option value="">All</option>{topOccupations.map(o => <option key={o.occupation} value={o.occupation}>{o.occupation} ({o.count})</option>)}</select></div>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button onClick={previewAudience} disabled={loading} className="px-3 py-1.5 text-xs font-semibold border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-1">{loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />} Preview</button>
              {audienceCount !== null && <span className="text-xs font-bold text-brand">{audienceCount} recipients</span>}
            </div>
          </Step>
        )}

        {/* Step 4: Compose */}
        {selectedEventId && (channels.email || channels.whatsapp) && (
          <Step num={4} title="Compose Message">
            {channels.email && (
              <div className="space-y-3 mb-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1"><Mail className="w-3 h-3" /> Email</p>
                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject line" className="input-field" />
                <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={5} placeholder="Email body..." className="input-field resize-y" />
              </div>
            )}
            {channels.whatsapp && (
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1"><MessageCircle className="w-3 h-3" /> WhatsApp</p>
                <textarea value={whatsappBody} onChange={e => { if (e.target.value.length <= 1024) setWhatsappBody(e.target.value); }} rows={4} placeholder="WhatsApp message..." className="input-field resize-y" maxLength={1024} />
                <p className="text-[9px] text-gray-400 text-right">{whatsappBody.length}/1024</p>
              </div>
            )}
          </Step>
        )}

        {/* Step 5: Preview */}
        {selectedEventId && (emailBody || whatsappBody) && (
          <Step num={5} title="Preview">
            <button onClick={() => setShowPreview(!showPreview)} className="px-4 py-2 text-xs font-semibold border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> {showPreview ? "Hide Preview" : "Show Preview"}
            </button>

            {showPreview && (
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Email Preview */}
                {channels.email && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">📧 Email Preview</p>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 max-h-[500px] overflow-y-auto">
                      <div className="bg-white rounded-lg shadow-sm p-3 mb-2">
                        <p className="text-[10px] text-gray-400">From: Udyaibase &lt;no-reply@udyaibase.com&gt;</p>
                        <p className="text-[10px] text-gray-400">Subject: <strong className="text-gray-700">{subject}</strong></p>
                      </div>
                      <div dangerouslySetInnerHTML={{ __html: emailPreviewHtml }} />
                    </div>
                  </div>
                )}

                {/* WhatsApp Preview */}
                {channels.whatsapp && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">💬 WhatsApp Preview</p>
                    <div className="bg-[#e5ddd5] dark:bg-[#0b141a] rounded-xl p-4 max-h-[500px] overflow-y-auto">
                      {/* Chat bubble */}
                      <div className="max-w-[280px]">
                        <div className="bg-white dark:bg-[#1f2c33] rounded-xl rounded-tl-sm shadow-sm overflow-hidden">
                          {selectedEvent?.coverImageUrl && (
                            <img src={selectedEvent.coverImageUrl} alt="" className="w-full h-32 object-cover" />
                          )}
                          <div className="px-3 py-2">
                            <p className="text-[13px] text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-relaxed" style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
                              {whatsappBody}
                            </p>
                            <div className="flex items-center justify-end gap-1 mt-1">
                              <span className="text-[10px] text-gray-400">10:30 AM</span>
                              <span className="text-[10px] text-blue-500">✓✓</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Step>
        )}

        {/* Send */}
        {selectedEventId && (emailBody || whatsappBody) && (
          <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
            {message && <p className={`text-sm mb-3 ${message.includes("✓") ? "text-green-600" : message.includes("⚠") ? "text-yellow-600" : "text-red-500"}`}>{message}</p>}
            <button onClick={handleSend} disabled={sending || (!channels.email && !channels.whatsapp)} className="px-6 py-2.5 bg-brand hover:bg-brand-600 text-white font-bold text-sm rounded-lg disabled:opacity-40 flex items-center gap-2 transition-colors">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? "Sending..." : "Send Campaign"}
            </button>
          </div>
        )}
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-3">📍 Cities</h3>
          <div className="space-y-1">{topCities.map((c, i) => <div key={c.city} className="flex justify-between text-xs"><span className="text-gray-600 dark:text-gray-300">{i+1}. {c.city}</span><span className="text-gray-400 font-semibold">{c.count}</span></div>)}</div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-3">💼 Occupations</h3>
          <div className="space-y-1">{topOccupations.map((o, i) => <div key={o.occupation} className="flex justify-between text-xs"><span className="text-gray-600 dark:text-gray-300">{i+1}. {o.occupation}</span><span className="text-gray-400 font-semibold">{o.count}</span></div>)}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Components ───

function Step({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
        <span className="w-5 h-5 bg-brand text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">{num}</span>
        {title}
      </h2>
      <div className="pl-7">{children}</div>
    </div>
  );
}

function StatCard({ icon: Icon, color, value, label }: { icon: any; color: string; value: number; label: string }) {
  const colors: Record<string, string> = { blue: "bg-blue-50 dark:bg-blue-900/20 text-blue-600", green: "bg-green-50 dark:bg-green-900/20 text-green-600", purple: "bg-purple-50 dark:bg-purple-900/20 text-purple-600" };
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors[color]}`}><Icon className="w-4 h-4" /></div>
      <div><p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p><p className="text-[10px] text-gray-500">{label}</p></div>
    </div>
  );
}

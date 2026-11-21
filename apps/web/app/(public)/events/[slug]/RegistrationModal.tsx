"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { Clock, X, CheckCircle, Loader2, Calendar, MapPin, Video } from "lucide-react";
import CitySelect from "@/components/events/CitySelect";
import TurnstileWidget from "@/components/shared/TurnstileWidget";
import { payWithRazorpay } from "@/lib/billing/checkout-client";
import { availableTiers, CHECKBOX_NO, CHECKBOX_YES, COUNTRY_CODES, formatPhone, OCCUPATIONS, phoneProblem } from "@/lib/events/registration-fields";

interface Props {
  event: any;
  customQuestions: any[];
  ticketTiers: any[];
  onClose: () => void;
}

export default function RegistrationModal({ event, customQuestions, ticketTiers, onClose }: Props) {
  const [step, setStep] = useState<"form" | "success">("form");
  // What registration actually resulted in; the success screen must never say "confirmed" for a waitlist place.
  const [outcome, setOutcome] = useState<{ status: string; position?: number; reason?: "capacity" | "plan_limit" }>({ status: "CONFIRMED" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [company, setCompany] = useState("");
  const [occupation, setOccupation] = useState("");
  const [locationCity, setLocationCity] = useState("");
  const [newsletterConsent, setNewsletterConsent] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  // Same as the widget: only ticket types on sale right now and not sold out.
  const openTiers = availableTiers(ticketTiers);
  const [ticketTierId, setTicketTierId] = useState(openTiers.length > 0 ? openTiers[0].id : "");
  const hostName = event.hostStartupName || event.organizerName || "the organizer";
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [turnstileToken, setTurnstileToken] = useState("");
  // Bot-check tokens are single-use: remount the widget for a fresh one after each attempt.
  const [captchaKey, setCaptchaKey] = useState(0);
  const [paid, setPaid] = useState(false);
  const tier = openTiers.find((t: any) => t.id === ticketTierId);
  const price = tier?.priceCents > 0 ? tier.priceCents : 0;

  const validateEmail = (val: string) => {
    const lower = val.toLowerCase();
    setEmail(lower);
    if (lower && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) {
      setEmailError("Enter a valid email address");
    } else {
      setEmailError("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (emailError) return;
    const pp = phoneProblem(countryCode, phone);
    setPhoneError(pp);
    setFieldErrors({});
    if (pp) return;
    setLoading(true);
    const payload = {
      eventId: event.id, name: name.trim(), email: email.trim(), phone: formatPhone(countryCode, phone) || null,
      company: company || null, role: null, occupation: occupation || null,
      locationCity: locationCity || null, newsletterConsent, whatsappConsent: !!phone.replace(/\D/g, "") && whatsappConsent,
      ticketTierId: ticketTierId || null,
      answers: Object.entries(answers).map(([questionId, answerText]) => ({ questionId, answerText })),
      turnstileToken,
    };
    try {
      if (price > 0) {
        // Paid ticket: hold a seat, pay through Razorpay, then the ticket is confirmed by email.
        const res = await fetch("/api/events/tickets/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (!res.ok || !data.success) { if (data.field) setFieldErrors({ [data.field]: data.error }); if (data.field === "phone") setPhoneError(data.error); setError(data.error || "Couldn’t start the payment."); return; }
        const out = await payWithRazorpay(data.data, "/api/events/tickets/verify");
        if (out.ok) { setPaid(true); setStep("success"); }
        else if (out.cancelled) setError(`Payment not completed. Your seat is held for ${data.data.holdMinutes} minutes. Try again to finish.`);
        else setError(out.error);
        return;
      }
      const res = await fetch("/api/events/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok || !data.success) { if (data.field) setFieldErrors({ [data.field]: data.error }); if (data.field === "phone") setPhoneError(data.error); setError(data.error || "Registration failed."); return; }
      setOutcome({ status: data.data?.status ?? "CONFIRMED", position: data.data?.waitlistPosition, reason: data.data?.waitlistReason });
      setStep("success");
    } catch { setError("Something went wrong."); }
    finally { setLoading(false); setTurnstileToken(""); setCaptchaKey((k) => k + 1); }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="font-sora font-bold text-lg text-navy dark:text-white">
            {step !== "success" ? "Register" : outcome.status === "WAITLISTED" ? "You're on the waitlist" : outcome.status === "PENDING_APPROVAL" ? "Request sent" : "You're In!"}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {step === "success" && (outcome.status === "WAITLISTED" || outcome.status === "PENDING_APPROVAL") ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
              <Clock className="w-8 h-8 text-amber-600" />
            </div>
            <h3 className="font-sora font-bold text-xl text-navy dark:text-white">
              {outcome.status === "WAITLISTED" ? (outcome.position ? `You're number ${outcome.position} on the waitlist` : "You're on the waitlist") : "Waiting for the host"}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 font-jakarta">
              {outcome.status === "WAITLISTED"
                ? <><strong>{event.title}</strong> is full right now.{outcome.reason === "plan_limit" ? " The host has been told and may open more spots." : ""} If a spot opens you get it automatically, and we&apos;ll email your ticket to <strong>{email}</strong>.</>
                : <>The host reviews every request for <strong>{event.title}</strong>. We&apos;ll email <strong>{email}</strong> with your ticket as soon as you&apos;re approved.</>}
            </p>
            <p className="text-xs text-gray-500 font-jakarta">This isn&apos;t a ticket yet, so please don&apos;t go to the venue until you hear from us.</p>
            <button onClick={onClose} className="w-full py-3 bg-brand hover:bg-brand-600 text-white font-bold font-jakarta text-sm rounded-xl transition-colors">Done</button>
          </div>
        ) : step === "success" ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="font-sora font-bold text-xl text-navy dark:text-white">Registration Confirmed!</h3>
            <p className="text-sm text-gray-500 font-jakarta">
              {paid && <>Payment received. </>}You&apos;re registered for <strong>{event.title}</strong>. A confirmation email with your QR code has been sent to <strong>{email}</strong>.
            </p>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-left">
              <p className="text-xs font-bold uppercase text-gray-400 font-jakarta mb-2">What&apos;s next</p>
              <ul className="space-y-1.5 text-sm text-gray-600 dark:text-gray-300 font-jakarta">
                <li>✓ Check your email for the QR code</li>
                <li>✓ Add the event to your calendar</li>
                <li>✓ Show the QR code at check-in</li>
              </ul>
            </div>
            <div className="flex gap-2">
              <a href={`/api/events/calendar?slug=${event.slug}`} download className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-jakarta font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 text-center transition-colors inline-flex items-center justify-center gap-1.5"><Calendar className="w-4 h-4" aria-hidden /> Download .ics</a>
              <a href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${new Date(event.startAt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}/${new Date(event.endAt).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}&ctz=${event.timezone}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-jakarta font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 text-center transition-colors">Google Calendar</a>
            </div>
            <button onClick={onClose} className="w-full py-3 bg-brand hover:bg-brand-600 text-white font-bold font-jakarta text-sm rounded-xl transition-colors">Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">

            {/* Event Header with Cover Image */}
            <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 mb-2">
              {/* Cover image (16:9) */}
              {event.coverImageUrl && (
                <div style={{ aspectRatio: "16/9" }} className="w-full">
                  <Image src={event.coverImageUrl} alt={`${event.title} cover image`} width={400} height={225} sizes="(max-width: 768px) 100vw, 50vw" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-3">
                <p className="text-sm font-sora font-bold text-navy dark:text-white">{event.title}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                  <span className="flex items-center gap-1 text-xs text-gray-500 font-jakarta">
                    <Calendar className="w-3 h-3 text-brand" />
                    {new Date(event.startAt).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: event.timezone || "Asia/Kolkata" })} • {new Date(event.startAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: event.timezone || "Asia/Kolkata" })}
                  </span>
                  {event.venueName ? (
                    <span className="flex items-center gap-1 text-xs text-gray-500 font-jakarta">
                      <MapPin className="w-3 h-3 text-blue-500" />{event.venueName}
                    </span>
                  ) : event.format === "VIRTUAL" ? (
                    <span className="flex items-center gap-1 text-xs text-gray-500 font-jakarta">
                      <Video className="w-3 h-3 text-purple-500" />Online
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-jakarta">Full Name *</label>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your full name" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand text-sm font-jakarta" />
            </div>

            {/* Email with live validation */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-jakarta">Email *</label>
              <input type="email" required value={email} onChange={(e) => validateEmail(e.target.value)} placeholder="you@company.com" className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 text-sm font-jakarta ${emailError ? "border-red-300 focus:ring-red-200 focus:border-red-400" : "border-gray-200 dark:border-gray-700 focus:ring-brand/30 focus:border-brand"}`} />
              {emailError && <p className="text-xs text-red-500 font-jakarta mt-0.5">{emailError}</p>}
            </div>

            {/* Phone (same format and check as the widget) */}
            <div>
              <label htmlFor="reg-phone" className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-jakarta">Phone <span className="normal-case text-gray-400">(Optional)</span></label>
              <div className="flex gap-2">
                <select aria-label="Country code" value={countryCode} onChange={(e) => { setCountryCode(e.target.value); setPhoneError(""); }} className="w-[104px] shrink-0 px-2 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/30">
                  {COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
                <input id="reg-phone" type="tel" inputMode="tel" autoComplete="tel-national" value={phone} onChange={(e) => { setPhone(e.target.value); setPhoneError(""); }} placeholder="98765 43210" aria-invalid={phoneError ? true : undefined} aria-describedby={phoneError ? "reg-phone-err" : undefined} className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 text-sm font-jakarta ${phoneError ? "border-red-300 focus:ring-red-200" : "border-gray-200 dark:border-gray-700 focus:ring-brand/30 focus:border-brand"}`} />
              </div>
              {phoneError ? <p id="reg-phone-err" className="text-xs text-red-500 font-jakarta mt-0.5">{phoneError}</p> : <p className="text-xs text-gray-400 font-jakarta mt-0.5">Used for event reminders and important updates</p>}
            </div>

            {/* Company / Organization */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-jakarta">Company / Organization <span className="normal-case text-gray-400">(Optional)</span></label>
              <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Where do you work or study?" className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand text-sm font-jakarta" />
            </div>

            {/* Occupation - searchable dropdown */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-jakarta">Occupation <span className="normal-case text-gray-400">(Optional)</span></label>
              <select value={occupation} onChange={(e) => setOccupation(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand appearance-none">
                <option value="">Select your occupation</option>
                {OCCUPATIONS.map((occ) => <option key={occ} value={occ}>{occ}</option>)}
              </select>
            </div>

            {/* City */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-jakarta">Your City <span className="normal-case text-gray-400">(Optional)</span></label>
              <CitySelect value={locationCity} onChange={(city) => setLocationCity(city.name)} placeholder="Search your city..." />
              <p className="text-xs text-gray-400 font-jakarta mt-0.5">Helps us notify you about events near you</p>
            </div>

            {/* Ticket Tier */}
            {ticketTiers.length > 0 && openTiers.length === 0 && (
              <p className="text-sm font-jakarta text-amber-800 dark:text-amber-300 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5">No tickets are on sale right now.</p>
            )}
            {openTiers.length === 1 && price > 0 && (
              <p className="text-sm font-jakarta text-gray-700 dark:text-gray-300 rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-2.5">
                <span className="font-semibold">{tier.name}</span> · ₹{(price / 100).toLocaleString("en-IN")}
                <span className="block text-xs text-gray-500">Paid securely via Razorpay. Refunded in full if the host cancels.</span>
              </p>
            )}
            {openTiers.length > 1 && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-jakarta">Ticket Type</label>
                <select value={ticketTierId} onChange={(e) => setTicketTierId(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/30">
                  {openTiers.map((tier: any) => (
                    <option key={tier.id} value={tier.id}>{tier.name} — {tier.priceCents === 0 ? "Free" : `₹${tier.priceCents / 100}`}{tier.quantity && ` (${tier.quantity - tier.soldCount} left)`}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Custom Questions */}
            {customQuestions.map((q: any) => (
              <div key={q.id}>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1 font-jakarta">{q.questionText} {q.required && "*"}</label>
                {fieldErrors[`q_${q.id}`] && <p className="text-xs text-red-500 font-jakarta mb-1">{fieldErrors[`q_${q.id}`]}</p>}
                {q.questionType === "TEXT" && (
                  <input type="text" required={q.required} value={answers[q.id] || ""} onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/30" />
                )}
                {q.questionType === "SELECT" && (
                  <select required={q.required} value={answers[q.id] || ""} onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/30">
                    <option value="">Select...</option>
                    {(q.options || []).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                )}
                {q.questionType === "CHECKBOX" && (
                  <label className="flex items-center gap-2 mt-1 cursor-pointer">
                    <input type="checkbox" checked={answers[q.id] === CHECKBOX_YES} onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.checked ? CHECKBOX_YES : CHECKBOX_NO }))} className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand" />
                    <span className="text-sm text-gray-600 dark:text-gray-300 font-jakarta">Yes</span>
                  </label>
                )}
              </div>
            ))}

            {/* Udyaibase event alerts (only on udyaibase.com, not in organizers' widgets) */}
            <div className="bg-brand/5 dark:bg-brand/10 rounded-xl p-3 border border-brand/10">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={newsletterConsent} onChange={(e) => setNewsletterConsent(e.target.checked)} className="w-4 h-4 mt-0.5 rounded border-gray-300 text-brand focus:ring-brand" />
                <span className="text-xs text-gray-600 dark:text-gray-300 font-jakarta leading-relaxed">Keep me updated about upcoming AI events, conferences, and opportunities in my area via email.</span>
              </label>
            </div>

            {/* WhatsApp reminders: only with a phone number, never pre-ticked (same as the widget) */}
            {phone.replace(/\D/g, "").length >= 6 && (
            <div className="bg-green-50 dark:bg-green-900/10 rounded-xl p-3 border border-green-100 dark:border-green-900/20">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={whatsappConsent} onChange={(e) => setWhatsappConsent(e.target.checked)} className="w-4 h-4 mt-0.5 rounded border-gray-300 text-green-600 focus:ring-green-500" />
                <span className="text-xs text-gray-600 dark:text-gray-300 font-jakarta leading-relaxed">Send me event reminders and updates on WhatsApp. You can opt out anytime.</span>
              </label>
            </div>
            )}

            {/* Turnstile CAPTCHA */}
            <TurnstileWidget key={captchaKey} onSuccess={setTurnstileToken} />

            {error && <p className="text-sm text-red-500 font-jakarta bg-red-50 dark:bg-red-900/20 p-3 rounded-xl">{error}</p>}

            <button type="submit" disabled={loading || !name.trim() || !email || !!emailError || !turnstileToken || (ticketTiers.length > 0 && !tier)} className="w-full py-3 bg-brand hover:bg-brand-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold font-jakarta text-sm rounded-xl transition-colors flex items-center justify-center gap-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />{price > 0 ? "Opening payment…" : "Registering..."}</> : price > 0 ? `Pay ₹${(price / 100).toLocaleString("en-IN")} and register` : "Complete Registration"}
            </button>

            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta text-center">By registering, you agree to share your details with {hostName}, who will use them to manage this event. Processed by Udyaibase under its <a href="/privacy" target="_blank" rel="noopener" className="underline">Privacy Policy</a>.</p>
          </form>
        )}
      </div>
    </div>
  );
}

"use client";
import { useState, useEffect, useRef } from "react";
import { Loader2, Save, Building2, Upload, X } from "lucide-react";
export default function OrganizationPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [data, setData] = useState({ name: "", company: "", bio: "", website: "", linkedin: "", phone: "", avatar: "" as string | null });
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadLogo = async (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setMessage("Use a JPG, PNG or WebP image"); return; }
    if (file.size > 5 * 1024 * 1024) { setMessage("Logo must be under 5 MB"); return; }
    setUploading(true); setMessage("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const up = await fetch("/api/organizer/upload", { method: "POST", body: fd }).then(r => r.json());
      if (!up.success) { setMessage(up.error || "Upload failed"); return; }
      const next = { ...data, avatar: up.url };
      const res = await fetch("/api/organizer/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).then(r => r.json());
      if (res.success) { setData(next); setMessage("Logo updated"); } else setMessage(res.error || "Couldn't save the logo");
    } catch { setMessage("You seem to be offline."); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  useEffect(() => { fetch("/api/organizer/profile").then(r => r.json()).then(d => { if (d.success) setData(d.profile); setLoading(false); }); }, []);
  const handleSave = async () => { setSaving(true); setMessage(""); const res = await fetch("/api/organizer/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); const r = await res.json(); setMessage(r.success ? "Saved!" : r.error || "Failed"); setSaving(false); setTimeout(() => setMessage(""), 3000); };
  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h1 className="portal-title">Organization</h1><p className="portal-subtitle">Your public organizer profile</p></div>{message && <span className={`text-xs font-jakarta ${message==="Saved!"?"text-green-600":"text-red-500"}`}>{message}</span>}</div>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-4"><div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center overflow-hidden shrink-0">{data.avatar ? <img src={data.avatar} alt="" className="w-full h-full object-cover" /> : <Building2 className="w-7 h-7 text-brand" />}</div><div className="min-w-0"><p className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta">{data.name || "Your Organization"}</p><div className="mt-1 flex flex-wrap items-center gap-2"><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="org-logo" onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} /><label htmlFor="org-logo" className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-gray-300 dark:border-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 font-jakarta">{uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}{data.avatar ? "Change logo" : "Upload logo"}</label>{data.avatar && !uploading && <button type="button" onClick={async () => { const next = { ...data, avatar: null }; const r = await fetch("/api/organizer/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).then(x => x.json()); if (r.success) setData(next); }} className="inline-flex items-center gap-1 min-h-[36px] px-2 text-xs font-semibold text-gray-500 hover:text-red-600 font-jakarta"><X className="w-3.5 h-3.5" /> Remove</button>}<span className="text-xs text-gray-400 font-jakarta">Square JPG, PNG or WebP, under 5 MB</span></div></div></div>
        <div><label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5 font-jakarta">Name *</label><input type="text" value={data.name} onChange={e => setData(p => ({...p, name: e.target.value}))} maxLength={100} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" /></div>
        <div><label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5 font-jakarta">Company</label><input type="text" value={data.company} onChange={e => setData(p => ({...p, company: e.target.value}))} placeholder="e.g. Udyaibase" maxLength={100} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand" /></div>
        <div><label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5 font-jakarta">Bio</label><textarea value={data.bio} onChange={e => setData(p => ({...p, bio: e.target.value}))} rows={3} placeholder="About your organization..." className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/30 resize-y" maxLength={500} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5 font-jakarta">Website</label><input type="url" value={data.website} onChange={e => setData(p => ({...p, website: e.target.value}))} placeholder="https://..." className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/30" /></div><div><label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5 font-jakarta">LinkedIn</label><input type="url" value={data.linkedin} onChange={e => setData(p => ({...p, linkedin: e.target.value}))} placeholder="https://linkedin.com/..." className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand/30" /></div></div>
        <button onClick={handleSave} disabled={saving} className="w-full sm:w-auto justify-center min-h-[48px] px-6 bg-brand hover:bg-brand-600 text-white font-bold font-jakarta text-sm rounded-xl disabled:opacity-50 flex items-center gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Changes</button>
      </div>
    </div>
  );
}

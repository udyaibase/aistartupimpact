"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Megaphone, FileText, Trophy, Clock, CheckCircle, XCircle,
  Eye, Loader2, ChevronDown, Pencil, Trash2, MoreHorizontal,
  Send, BookOpen, ArrowRight,
} from "lucide-react";
import { MilestoneIcon } from '@/components/milestones/MilestoneIcon';

type Tab = "all" | "updates" | "stories" | "milestones";

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PUBLISHED: { label: "Published", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  DRAFT: { label: "Draft", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  IN_REVIEW: { label: "In Review", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  ARCHIVED: { label: "Archived", cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500" },
};

const MOD_BADGE: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: "Approved", cls: "text-green-600 dark:text-green-400" },
  PENDING_REVIEW: { label: "Pending Review", cls: "text-amber-600 dark:text-amber-400" },
  REJECTED: { label: "Rejected", cls: "text-red-600 dark:text-red-400" },
  REVISION_REQUESTED: { label: "Needs Revision", cls: "text-orange-600 dark:text-orange-400" },
};

export default function CreatePage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [articles, setArticles] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [startups, setStartups] = useState<any[]>([]);
  const [mentions, setMentions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startupFilter, setStartupFilter] = useState("");

  useEffect(() => { fetchContent(); }, []);

  const fetchContent = async () => {
    setLoading(true);
    try {
      const [artRes, msRes] = await Promise.all([
        fetch("/api/founder/content").then(r => r.json()).catch(() => ({ articles: [], startups: [] })),
        fetch("/api/founder/milestones").then(r => r.json()).catch(() => ({ milestones: [] })),
      ]);
      setArticles(artRes.articles || []);
      setMilestones(msRes.milestones || []);
      setMentions(artRes.mentions || []);
      setStartups(artRes.startups || msRes.startups || []);
    } catch {}
    setLoading(false);
  };

  const filtered = (() => {
    const arts = articles.filter(a => !startupFilter || a.startupId === startupFilter);
    const ms = milestones.filter(m => !startupFilter || m.startupId === startupFilter);
    if (tab === "updates") return { articles: arts.filter(a => a.type === "STARTUP_UPDATE"), milestones: [] };
    if (tab === "stories") return { articles: arts.filter(a => a.type === "FOUNDER_STORY"), milestones: [] };
    if (tab === "milestones") return { articles: [], milestones: ms };
    return { articles: arts, milestones: ms };
  })();

  const totalCount = filtered.articles.length + filtered.milestones.length;

  const handleDelete = async (id: string, type: "article" | "milestone") => {
    if (!confirm("Delete this item?")) return;
    const url = type === "article" ? `/api/founder/content/${id}` : `/api/founder/milestones/${id}`;
    await fetch(url, { method: "DELETE" }).catch(() => {});
    fetchContent();
  };

  const CREATE_OPTIONS = [
    {
      icon: Megaphone,
      title: "Startup Update",
      desc: "Share news, progress, or announcements. Publishes instantly.",
      href: "/founder/content/new?type=STARTUP_UPDATE",
      color: "from-blue-500 to-cyan-500",
    },
    {
      icon: BookOpen,
      title: "Founder Story",
      desc: "Tell your journey. Reviewed by our editorial team before publishing.",
      href: "/founder/content/new?type=FOUNDER_STORY",
      color: "from-purple-500 to-pink-500",
    },
    {
      icon: Trophy,
      title: "Milestone",
      desc: "Record a key achievement — funding, launch, partnership, or award.",
      href: "/founder/milestones/new",
      color: "from-amber-500 to-orange-500",
    },
  ];

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "all", label: "All", count: articles.length + milestones.length },
    { key: "updates", label: "Updates", count: articles.filter(a => a.type === "STARTUP_UPDATE").length },
    { key: "stories", label: "Stories", count: articles.filter(a => a.type === "FOUNDER_STORY").length },
    { key: "milestones", label: "Milestones", count: milestones.length },
  ];

  return (
    <div>
      <div>

        {/* Create Options — LinkedIn-style cards */}
        <div className="mb-8">
          <h1 className="portal-title">Create</h1>
          <p className="portal-subtitle mb-5">Share your startup's story with the ecosystem</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {CREATE_OPTIONS.map(opt => (
              <button
                key={opt.title}
                onClick={() => router.push(opt.href)}
                className="group text-left p-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl hover:border-brand/30 dark:hover:border-brand/30 hover:shadow-lg hover:shadow-brand/5 transition-all duration-200"
              >
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${opt.color} flex items-center justify-center text-white mb-3 group-hover:scale-110 transition-transform`}>
                  <opt.icon className="w-5 h-5" aria-hidden />
                </div>
                <h3 className="text-sm font-sora font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-1.5">
                  {opt.title}
                  <ArrowRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-brand group-hover:translate-x-0.5 transition-all" />
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta leading-relaxed">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Your Content — Feed below */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-sora font-bold text-gray-900 dark:text-white">Your Content</h2>
            <div className="flex items-center gap-2">
              {startups.length > 1 && (
                <div className="relative">
                  <select value={startupFilter} onChange={e => setStartupFilter(e.target.value)} className="appearance-none pl-3 pr-7 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-jakarta text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand/20">
                    <option value="">All Startups</option>
                    {startups.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 w-fit">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded-md text-xs font-jakarta font-medium transition-all ${tab === t.key ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                {t.label}
                <span className={`ml-1 text-[10px] ${tab === t.key ? "text-brand" : "text-gray-400"}`}>{t.count}</span>
              </button>
            ))}
          </div>

          {/* Content Feed */}
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
          ) : totalCount === 0 ? (
            <div className="text-center py-12 px-4 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
              <Send className="w-8 h-8 text-gray-400 mx-auto mb-2" aria-hidden />
              <p className="text-[15px] font-semibold font-jakarta text-gray-900 dark:text-white">You haven’t posted anything yet</p>
              <p className="text-sm font-jakarta text-gray-600 dark:text-gray-400 mt-1 max-w-md mx-auto">Start with a short update, like a launch or a new customer. Updates publish straight away. Founder stories are reviewed by our editors first.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Articles */}
              {filtered.articles.map(a => {
                const sb = STATUS_BADGE[a.status] || STATUS_BADGE.DRAFT;
                const mb = MOD_BADGE[a.moderationStatus];
                const isUpdate = a.type === "STARTUP_UPDATE";
                return (
                  <div key={a.id} className="group flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl hover:border-gray-200 dark:hover:border-gray-700 transition-colors">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isUpdate ? "bg-blue-50 dark:bg-blue-900/20" : "bg-purple-50 dark:bg-purple-900/20"}`}>
                      {isUpdate ? <Megaphone className="w-4 h-4 text-blue-500" /> : <BookOpen className="w-4 h-4 text-purple-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-jakarta font-semibold text-gray-900 dark:text-white truncate">{a.title}</h3>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-jakarta font-medium shrink-0 ${sb.cls}`}>{sb.label}</span>
                        {mb && mb.label !== "Approved" && <span className={`text-[10px] font-jakarta font-medium shrink-0 ${mb.cls}`}>{mb.label}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400 font-jakarta">
                        <span className={`${isUpdate ? "text-blue-500" : "text-purple-500"} font-medium`}>{isUpdate ? "Update" : "Story"}</span>
                        <span>·</span>
                        {a.Startup && <><span>{a.Startup.name}</span><span>·</span></>}
                        <span>{new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        {a.viewCount > 0 && <><span>·</span><span className="flex items-center gap-0.5"><Eye className="w-3 h-3" />{a.viewCount}</span></>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => router.push(`/founder/content/${a.id}/edit`)} className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg" aria-label="Edit">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(a.id, "article")} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" aria-label="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Milestones */}
              {filtered.milestones.map(m => (
                <div key={m.id} className="group flex items-center gap-3 px-4 py-3.5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl hover:border-gray-200 dark:hover:border-gray-700 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-base shrink-0">
                    <MilestoneIcon type={m.type} className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-jakarta font-semibold text-gray-900 dark:text-white truncate">{m.title}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 font-jakarta font-medium shrink-0">{m.type.replace("_", " ")}</span>
                      {m.verificationStatus === "PLATFORM_VERIFIED" && <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400 font-jakarta">
                      <span className="text-amber-500 font-medium">Milestone</span>
                      <span>·</span>
                      {m.startup && <><span>{m.startup.name}</span><span>·</span></>}
                      <span>{new Date(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      {m.amount && <><span>·</span><span>{m.currency} {Number(m.amount).toLocaleString()}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleDelete(m.id, "milestone")} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" aria-label="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {mentions.length > 0 && (
            <section aria-labelledby="mentions-title" className="mt-8">
              <h2 id="mentions-title" className="text-lg font-sora font-bold text-gray-900 dark:text-white">Stories that mention you</h2>
              <p className="text-sm font-jakarta text-gray-600 dark:text-gray-400 mt-0.5 mb-3">Written by the Udyaibase team. Share them with your network. Spotted a mistake? Contact Support.</p>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800 border border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900">
                {mentions.map((a) => (
                  <li key={a.id}>
                    <a href={`/${a.type === "STORY" ? "stories" : "news"}/${a.slug}`} target="_blank" rel="noopener" className="flex items-center justify-between gap-3 px-4 py-3 min-h-[44px] hover:bg-gray-50 dark:hover:bg-gray-800">
                      <span className="text-sm font-medium font-jakarta text-gray-900 dark:text-white">{a.title}</span>
                      {a.publishedAt && <span className="shrink-0 text-xs font-jakarta text-gray-500">{new Date(a.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

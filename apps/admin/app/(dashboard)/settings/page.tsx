'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Settings, Globe, Palette, Bell, Shield, Save, Check, Database, Loader2, X } from 'lucide-react';
import { getSettingsAction, saveSettingsAction } from './actions';
import SystemInfoSection from './SystemInfoSection';
import { notify } from '@/components/Toast';
import { BrandDesignSection } from './BrandDesignSection';
import { SecuritySection } from './SecuritySection';

const sections = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'seo', label: 'SEO Defaults', icon: Globe },
  { id: 'brand', label: 'Brand & Design', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'system', label: 'System Info', icon: Database },
];

interface SettingsData {
  siteTitle: string; tagline: string; contactEmail: string;
  socialTwitter: string; socialLinkedin: string; socialInstagram: string; socialFacebook: string;
  metaTitle: string; metaDescription: string; autoSitemap: boolean;
  seo_twitterHandle: string; seo_gaId: string; seo_gscVerification: string;
  canonicalDomain: string; seo_noindex: boolean; socialYoutube: string; socialWhatsappChannel?: string;
  brandColor: string; brandSecondary: string; brandTertiary: string; darkDefault: boolean;
  notifArticle: boolean; notifPublish: boolean; notifSubscriber: boolean; notifPlacement: boolean;
  require2FA: boolean; sessionTimeout: number;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [active, setActive] = useState('general');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const userRole = (session?.user as any)?.role || '';

  useEffect(() => {
    const loadData = async () => {
      try {
        const settingsRes = await getSettingsAction();
        if (settingsRes.success) {
          setSettings(settingsRes.data as SettingsData);
        } else {
          setError(settingsRes.error || 'Failed to load settings');
        }
      } catch (error) {
        console.error('Error loading settings:', error);
        notify("Couldn't load this. Check your connection and refresh.", 'error');
      }
      setLoading(false);
    };
    loadData();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    const res = await saveSettingsAction(settings);
    setSaving(false);
    if (res.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const updateSetting = (key: keyof SettingsData, value: any) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
  };

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <button onClick={() => onChange(!value)} className={`w-10 h-6 rounded-full relative transition-colors ${value ? 'bg-brand' : 'bg-gray-200 dark:bg-gray-700'}`}>
      <span className={`w-4 h-4 bg-white rounded-full absolute top-1 shadow-sm transition-all ${value ? 'right-1' : 'left-1'}`} />
    </button>
  );

  if (loading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-brand" />
    </div>
  );

  if (!settings) return (
    <div className="text-center py-20">
      <p className="text-gray-400">Failed to load settings</p>
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="portal-title">Settings</h1>
          <p className="portal-subtitle">Configure site-wide settings</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className={`text-sm flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold transition-all disabled:opacity-50 ${saved ? 'bg-green-500 text-white' : 'btn-brand'}`}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className="flex gap-6">
        <div className="w-48 shrink-0 space-y-1">
          {sections.map((s) => (
            <button key={s.id} onClick={() => setActive(s.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-jakarta font-medium transition-colors ${active === s.id ? 'bg-brand/10 text-brand' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              <s.icon className="w-4 h-4" />{s.label}
            </button>
          ))}
        </div>

        <div className="flex-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6">
          {active === 'general' && (
            <div className="space-y-5">
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white">General Settings</h2>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Site Title</label>
                <input type="text" className="input-field text-sm" value={settings.siteTitle} onChange={(e) => updateSetting('siteTitle', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Tagline</label>
                <input type="text" className="input-field text-sm" value={settings.tagline} onChange={(e) => updateSetting('tagline', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Contact Email</label>
                <input type="email" className="input-field text-sm" value={settings.contactEmail} onChange={(e) => updateSetting('contactEmail', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Social Links</label>
                <div className="space-y-2">
                  <input type="url" className="input-field text-sm" placeholder="Twitter URL" value={settings.socialTwitter} onChange={(e) => updateSetting('socialTwitter', e.target.value)} />
                  <input type="url" className="input-field text-sm" placeholder="LinkedIn URL" value={settings.socialLinkedin} onChange={(e) => updateSetting('socialLinkedin', e.target.value)} />
                  <input type="url" className="input-field text-sm" placeholder="Instagram URL" value={settings.socialInstagram} onChange={(e) => updateSetting('socialInstagram', e.target.value)} />
                  <input type="url" className="input-field text-sm" placeholder="Facebook URL" value={settings.socialFacebook} onChange={(e) => updateSetting('socialFacebook', e.target.value)} />
                  <input type="url" className="input-field text-sm" placeholder="WhatsApp jobs channel (https://whatsapp.com/channel/…)" aria-label="WhatsApp jobs channel link" value={settings.socialWhatsappChannel ?? ''} onChange={(e) => updateSetting('socialWhatsappChannel', e.target.value)} />
                  <p className="text-xs text-gray-500 dark:text-gray-400">The WhatsApp channel link shows a “Join on WhatsApp” prompt after candidates apply and on AI Jobs pages. Leave empty to hide it.</p>
                </div>
              </div>
            </div>
          )}

          {active === 'seo' && (
            <div className="space-y-6">
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white">SEO Defaults</h2>

              {/* Meta Title */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">Page Metadata</h3>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase font-jakarta">Default Meta Title</label>
                    <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${(settings.metaTitle?.length || 0) <= 50 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : (settings.metaTitle?.length || 0) <= 60 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                      {settings.metaTitle?.length || 0}/60
                    </span>
                  </div>
                  <input type="text" className="input-field text-sm" value={settings.metaTitle} onChange={(e) => updateSetting('metaTitle', e.target.value)} />
                  <p className="text-[11px] text-gray-400 font-jakarta mt-1">Appears in browser tabs and search engine results</p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase font-jakarta">Default Meta Description</label>
                    <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${(settings.metaDescription?.length || 0) <= 140 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : (settings.metaDescription?.length || 0) <= 160 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                      {settings.metaDescription?.length || 0}/160
                    </span>
                  </div>
                  <textarea className="input-field text-sm" rows={3} value={settings.metaDescription} onChange={(e) => updateSetting('metaDescription', e.target.value)} />
                  <p className="text-[11px] text-gray-400 font-jakarta mt-1">Shown as the snippet below search results</p>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                  <p className="text-[10px] text-gray-400 font-jakarta uppercase font-semibold mb-2">OG / Social Image</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta">Managed in the <button onClick={() => setActive('brand')} className="text-brand font-semibold hover:underline">Brand & Design</button> section under &ldquo;Favicon & Social Image&rdquo;</p>
                </div>
              </div>

              {/* Social & Identity */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">Social & Identity</h3>
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Twitter / X Handle</label>
                  <input type="text" className="input-field text-sm" placeholder="@yourhandle" value={settings.seo_twitterHandle} onChange={(e) => updateSetting('seo_twitterHandle', e.target.value)} />
                  <p className="text-[11px] text-gray-400 font-jakarta mt-1">Used for twitter:site and twitter:creator meta tags</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Canonical Domain</label>
                  <input type="url" className="input-field text-sm" placeholder="https://udyaibase.com" value={settings.canonicalDomain} onChange={(e) => updateSetting('canonicalDomain', e.target.value)} />
                  <p className="text-[11px] text-gray-400 font-jakarta mt-1">Primary domain for canonical URLs, sitemaps, and structured data</p>
                </div>
              </div>

              {/* Analytics & Verification */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">Analytics & Verification</h3>
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Google Analytics Measurement ID</label>
                  <input type="text" className="input-field text-sm font-mono" placeholder="G-XXXXXXXXXX" value={settings.seo_gaId} onChange={(e) => updateSetting('seo_gaId', e.target.value)} />
                  <p className="text-[11px] text-gray-400 font-jakarta mt-1">Overrides the environment variable if set</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">Google Search Console Verification</label>
                  <input type="text" className="input-field text-sm font-mono" placeholder="verification-token" value={settings.seo_gscVerification} onChange={(e) => updateSetting('seo_gscVerification', e.target.value)} />
                  <p className="text-[11px] text-gray-400 font-jakarta mt-1">Added as a &lt;meta name=&quot;google-site-verification&quot;&gt; tag</p>
                </div>
              </div>

              {/* Crawling & Indexing */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">Crawling & Indexing</h3>
                <div className="flex items-center justify-between py-1">
                  <div>
                    <span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta">Auto-generate sitemap</span>
                    <p className="text-[11px] text-gray-400 font-jakarta mt-0.5">Include sitemap references in robots.txt</p>
                  </div>
                  <Toggle value={settings.autoSitemap} onChange={(v) => updateSetting('autoSitemap', v)} />
                </div>
                <div className="flex items-center justify-between py-1 border-t border-gray-200 dark:border-gray-700 pt-3">
                  <div>
                    <span className="text-sm text-red-600 dark:text-red-400 font-jakarta font-medium">Block search engine indexing</span>
                    <p className="text-[11px] text-gray-400 font-jakarta mt-0.5">Adds noindex to all pages and blocks crawlers via robots.txt. Enable for staging only.</p>
                  </div>
                  <Toggle value={settings.seo_noindex} onChange={(v) => updateSetting('seo_noindex', v)} />
                </div>
              </div>
            </div>
          )}

          {active === 'brand' && (
            <BrandDesignSection settings={settings} updateSetting={updateSetting} Toggle={Toggle} />
          )}

          {active === 'notifications' && (
            <div className="space-y-5">
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Notifications</h2>
              {[
                { label: 'New article submitted', key: 'notifArticle' as keyof SettingsData },
                { label: 'Article published', key: 'notifPublish' as keyof SettingsData },
                { label: 'New subscriber', key: 'notifSubscriber' as keyof SettingsData },
                { label: 'Placement booked', key: 'notifPlacement' as keyof SettingsData },
              ].map((n) => (
                <div key={n.key} className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta">{n.label}</span>
                  <Toggle value={settings[n.key] as boolean} onChange={(v) => updateSetting(n.key, v)} />
                </div>
              ))}
            </div>
          )}

          {active === 'security' && (
            <SecuritySection settings={settings} updateSetting={updateSetting} Toggle={Toggle} userRole={userRole} />
          )}

          {active === 'system' && <SystemInfoSection />}
        </div>
      </div>
    </div>
  );
}

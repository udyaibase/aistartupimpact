'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Settings, Globe, Palette, Bell, Shield, Save, Check, Database, Loader2, Smartphone, Copy, CheckCircle2, XCircle, AlertTriangle, Upload, Type, X } from 'lucide-react';
import { getSettingsAction, saveSettingsAction } from './actions';
import SystemInfoSection from './SystemInfoSection';

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
  canonicalDomain: string; seo_noindex: boolean; socialYoutube: string;
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
          <h1 className="font-sora font-extrabold text-2xl text-navy dark:text-white">Settings</h1>
          <p className="text-gray-400 dark:text-gray-500 text-sm font-jakarta mt-1">Configure site-wide settings</p>
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

function BrandAssetUpload({ label, description, assetType, currentUrl, accept, onUploaded }: {
  label: string; description: string; assetType: string; currentUrl: string | null; accept: string; onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true); setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('assetType', assetType);
      const res = await fetch('/api/admin/brand', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) onUploaded(data.url);
      else setError(data.error || 'Upload failed');
    } catch { setError('Upload failed'); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase font-jakarta">{label}</p>
          <p className="text-[11px] text-gray-400 font-jakarta">{description}</p>
        </div>
        {uploading && <Loader2 className="w-4 h-4 animate-spin text-brand" />}
      </div>
      <div
        onClick={() => fileRef.current?.click()}
        className="relative border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center cursor-pointer hover:border-brand transition-colors group"
      >
        {currentUrl ? (
          <div className="flex items-center justify-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentUrl} alt={label} className="h-10 max-w-[160px] object-contain rounded" />
            <span className="text-xs text-gray-400 group-hover:text-brand font-jakarta transition-colors">Click to replace</span>
          </div>
        ) : (
          <div className="py-2">
            <Upload className="w-5 h-5 text-gray-300 dark:text-gray-600 mx-auto mb-1" />
            <p className="text-xs text-gray-400 font-jakarta">Click to upload</p>
          </div>
        )}
        <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
      </div>
      {error && <p className="text-xs text-red-500 font-jakarta">{error}</p>}
    </div>
  );
}

const GOOGLE_FONTS_LIST = [
  { name: "Inter", category: "Sans-serif" },
  { name: "Plus Jakarta Sans", category: "Sans-serif" },
  { name: "Sora", category: "Sans-serif" },
  { name: "DM Sans", category: "Sans-serif" },
  { name: "Outfit", category: "Sans-serif" },
  { name: "Space Grotesk", category: "Sans-serif" },
  { name: "Manrope", category: "Sans-serif" },
  { name: "Poppins", category: "Sans-serif" },
  { name: "Lora", category: "Serif" },
  { name: "Playfair Display", category: "Serif" },
  { name: "Source Serif 4", category: "Serif" },
  { name: "Fraunces", category: "Serif" },
  { name: "JetBrains Mono", category: "Monospace" },
];

function ColorPicker({ label, description, value, onChange }: { label: string; description: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-4">
      <input type="color" className="w-10 h-10 rounded-lg border-2 border-gray-200 dark:border-gray-700 cursor-pointer" value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="flex-1">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta">{label}</p>
        <p className="text-[11px] text-gray-400 font-jakarta">{description}</p>
      </div>
      <input type="text" className="input-field text-xs font-mono w-24 text-center" value={value}
        onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onChange(e.target.value); }} maxLength={7} />
      <div className="flex gap-1">
        <div className="w-6 h-6 rounded" style={{ backgroundColor: value }} />
        <div className="w-6 h-6 rounded" style={{ backgroundColor: value, opacity: 0.2 }} />
      </div>
    </div>
  );
}

function FontSelector({ label, description, selectedFont, customFontName, customFontUrl, onFontChange, onUploadFont, onRemoveCustomFont, role }: {
  label: string; description: string; selectedFont: string | null; customFontName: string | null; customFontUrl: string | null;
  onFontChange: (font: string | null) => void; onUploadFont: (file: File, fontName: string) => void; onRemoveCustomFont: () => void; role: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [fontNameInput, setFontNameInput] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith('.woff2')) { setUploadError('Only .woff2 files accepted'); return; }
    if (file.size > 2 * 1024 * 1024) { setUploadError('File must be under 2MB'); return; }
    const name = fontNameInput.trim() || file.name.replace(/\.woff2$/i, '');
    setUploading(true); setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('assetType', role === 'display' ? 'customDisplayFont' : 'customBodyFont');
      formData.append('fontName', name);
      const res = await fetch('/api/admin/brand', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) { onUploadFont(file, data.fontName); setShowUpload(false); setFontNameInput(''); }
      else setUploadError(data.error || 'Upload failed');
    } catch { setUploadError('Upload failed'); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta">{label}</p>
        <p className="text-[11px] text-gray-400 font-jakarta">{description}</p>
      </div>

      {customFontName && customFontUrl ? (
        <div className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <Type className="w-4 h-4 text-brand" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-white font-jakarta">{customFontName}</p>
            <p className="text-[10px] text-gray-400 font-jakarta">Custom uploaded font</p>
          </div>
          <button onClick={onRemoveCustomFont} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <select
          className="input-field text-sm w-full"
          value={selectedFont || ''}
          onChange={(e) => onFontChange(e.target.value || null)}
        >
          <option value="">System default</option>
          {Object.entries(
            GOOGLE_FONTS_LIST.reduce((acc, f) => {
              if (!acc[f.category]) acc[f.category] = [];
              acc[f.category].push(f.name);
              return acc;
            }, {} as Record<string, string[]>)
          ).map(([category, fonts]) => (
            <optgroup key={category} label={category}>
              {fonts.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      )}

      {!customFontUrl && (
        <>
          {showUpload ? (
            <div className="space-y-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <input type="text" className="input-field text-sm" placeholder="Font family name (e.g., My Brand Font)" value={fontNameInput} onChange={(e) => setFontNameInput(e.target.value)} />
              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-3 text-center cursor-pointer hover:border-brand transition-colors">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin text-brand mx-auto" /> : (
                  <p className="text-xs text-gray-400 font-jakarta"><Upload className="w-4 h-4 mx-auto mb-1 text-gray-300" />Click to upload .woff2 file (max 2MB)</p>
                )}
                <input ref={fileRef} type="file" accept=".woff2" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }} />
              </div>
              {uploadError && <p className="text-xs text-red-500 font-jakarta">{uploadError}</p>}
              <button onClick={() => { setShowUpload(false); setUploadError(''); }} className="text-xs text-gray-400 hover:text-gray-600 font-jakarta">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setShowUpload(true)} className="text-xs text-brand hover:text-brand/80 font-semibold font-jakarta flex items-center gap-1">
              <Upload className="w-3 h-3" /> Upload custom font
            </button>
          )}
        </>
      )}
    </div>
  );
}

function BrandDesignSection({ settings, updateSetting, Toggle }: { settings: any; updateSetting: any; Toggle: any }) {
  const [brandAssets, setBrandAssets] = useState<Record<string, string | null>>({
    logoLight: null, logoDark: null, favicon: null, ogImage: null,
  });
  const [brandColors, setBrandColors] = useState({ primary: '#FF3131', secondary: '#1B3A5C', tertiary: '#F59E0B' });
  const [fontConfig, setFontConfig] = useState({
    displayFont: null as string | null, bodyFont: null as string | null,
    customDisplayFontUrl: null as string | null, customBodyFontUrl: null as string | null,
    customDisplayFontName: null as string | null, customBodyFontName: null as string | null,
  });
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [savingColors, setSavingColors] = useState(false);
  const [savingFonts, setSavingFonts] = useState(false);
  const [colorSaved, setColorSaved] = useState(false);
  const [fontSaved, setFontSaved] = useState(false);

  useEffect(() => {
    fetch('/api/admin/brand').then(r => r.json()).then(data => {
      if (data.success) {
        setBrandAssets({ logoLight: data.brand.logoLight, logoDark: data.brand.logoDark, favicon: data.brand.favicon, ogImage: data.brand.ogImage });
        setBrandColors({ primary: data.brand.brandColor || '#FF3131', secondary: data.brand.brandSecondary || '#1B3A5C', tertiary: data.brand.brandTertiary || '#F59E0B' });
        setFontConfig({
          displayFont: data.brand.displayFont, bodyFont: data.brand.bodyFont,
          customDisplayFontUrl: data.brand.customDisplayFontUrl, customBodyFontUrl: data.brand.customBodyFontUrl,
          customDisplayFontName: data.brand.customDisplayFontName, customBodyFontName: data.brand.customBodyFontName,
        });
      }
    }).catch(() => {}).finally(() => setLoadingAssets(false));
  }, []);

  const handleAssetUploaded = (assetType: string, url: string) => {
    setBrandAssets(prev => ({ ...prev, [assetType]: url }));
  };

  const [colorError, setColorError] = useState('');

  const saveColors = async () => {
    setSavingColors(true);
    setColorError('');
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'saveColors', brandColor: brandColors.primary, brandSecondary: brandColors.secondary, brandTertiary: brandColors.tertiary }),
      });
      const data = await res.json();
      if (data.success) {
        updateSetting('brandColor', brandColors.primary);
        updateSetting('brandSecondary', brandColors.secondary);
        updateSetting('brandTertiary', brandColors.tertiary);
        setColorSaved(true); setTimeout(() => setColorSaved(false), 2000);
      } else {
        setColorError(data.error || 'Failed to save colors');
      }
    } catch (e: any) {
      setColorError(e.message || 'Network error saving colors');
    }
    finally { setSavingColors(false); }
  };

  const saveFonts = async () => {
    setSavingFonts(true);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'saveFonts', displayFont: fontConfig.displayFont, bodyFont: fontConfig.bodyFont }),
      });
      const data = await res.json();
      if (data.success) { setFontSaved(true); setTimeout(() => setFontSaved(false), 2000); }
    } catch {}
    finally { setSavingFonts(false); }
  };

  const removeCustomFont = async (role: 'display' | 'body') => {
    try {
      await fetch('/api/admin/brand', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'removeCustomFont', role }),
      });
      if (role === 'display') setFontConfig(prev => ({ ...prev, customDisplayFontUrl: null, customDisplayFontName: null }));
      else setFontConfig(prev => ({ ...prev, customBodyFontUrl: null, customBodyFontName: null }));
    } catch {}
  };

  return (
    <div className="space-y-6">
      <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Brand & Design</h2>

      {/* Brand Colors — 3-tier */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">Brand Colors</h3>
          <button onClick={saveColors} disabled={savingColors}
            className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${colorSaved ? 'bg-green-500 text-white' : 'bg-brand/10 text-brand hover:bg-brand/20'}`}>
            {savingColors ? <Loader2 className="w-3 h-3 animate-spin" /> : colorSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
            {savingColors ? 'Saving...' : colorSaved ? 'Saved!' : 'Save Colors'}
          </button>
        </div>
        {colorError && <p className="text-xs text-red-500 font-jakarta">{colorError}</p>}
        <div className="space-y-4">
          <ColorPicker label="Primary" description="Buttons, links, CTAs, active states" value={brandColors.primary} onChange={(v) => setBrandColors(prev => ({ ...prev, primary: v }))} />
          <ColorPicker label="Secondary" description="Supporting UI, card headers, navigation accents" value={brandColors.secondary} onChange={(v) => setBrandColors(prev => ({ ...prev, secondary: v }))} />
          <ColorPicker label="Tertiary" description="Subtle accents, badges, highlights, tags" value={brandColors.tertiary} onChange={(v) => setBrandColors(prev => ({ ...prev, tertiary: v }))} />
        </div>
        {/* Live preview */}
        <div className="mt-4 p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-[10px] text-gray-400 font-jakarta uppercase font-semibold mb-3">Live Preview</p>
          <div className="flex items-center gap-3 flex-wrap">
            <button className="px-4 py-2 rounded-lg text-white text-xs font-semibold" style={{ backgroundColor: brandColors.primary }}>Primary Button</button>
            <button className="px-4 py-2 rounded-lg text-white text-xs font-semibold" style={{ backgroundColor: brandColors.secondary }}>Secondary</button>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: brandColors.tertiary }}>Badge</span>
            <span className="text-xs font-semibold" style={{ color: brandColors.primary }}>Link text</span>
          </div>
          <div className="flex gap-1.5 mt-3">
            {[brandColors.primary, brandColors.secondary, brandColors.tertiary].map((c, i) => (
              <div key={i} className="flex-1 h-2 rounded-full" style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>
      </div>

      {/* Typography */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">Typography</h3>
            <p className="text-[11px] text-gray-400 font-jakarta mt-0.5">Select from Google Fonts or upload custom .woff2 files</p>
          </div>
          <button onClick={saveFonts} disabled={savingFonts}
            className={`text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all ${fontSaved ? 'bg-green-500 text-white' : 'bg-brand/10 text-brand hover:bg-brand/20'}`}>
            {savingFonts ? <Loader2 className="w-3 h-3 animate-spin" /> : fontSaved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
            {savingFonts ? 'Saving...' : fontSaved ? 'Saved!' : 'Save Fonts'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <FontSelector
            label="Display Font"
            description="Headlines, titles, hero text"
            selectedFont={fontConfig.displayFont}
            customFontName={fontConfig.customDisplayFontName}
            customFontUrl={fontConfig.customDisplayFontUrl}
            onFontChange={(f) => setFontConfig(prev => ({ ...prev, displayFont: f }))}
            onUploadFont={(_file, fontName) => setFontConfig(prev => ({ ...prev, customDisplayFontName: fontName, customDisplayFontUrl: 'uploaded' }))}
            onRemoveCustomFont={() => removeCustomFont('display')}
            role="display"
          />
          <FontSelector
            label="Body Font"
            description="Paragraphs, captions, UI text"
            selectedFont={fontConfig.bodyFont}
            customFontName={fontConfig.customBodyFontName}
            customFontUrl={fontConfig.customBodyFontUrl}
            onFontChange={(f) => setFontConfig(prev => ({ ...prev, bodyFont: f }))}
            onUploadFont={(_file, fontName) => setFontConfig(prev => ({ ...prev, customBodyFontName: fontName, customBodyFontUrl: 'uploaded' }))}
            onRemoveCustomFont={() => removeCustomFont('body')}
            role="body"
          />
        </div>
        {/* Font preview */}
        <div className="p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-[10px] text-gray-400 font-jakarta uppercase font-semibold mb-3">Font Preview</p>
          <div className="space-y-2">
            <p className="text-lg font-bold text-gray-900 dark:text-white" style={{ fontFamily: fontConfig.customDisplayFontName || fontConfig.displayFont || 'inherit' }}>
              The quick brown fox jumps over the lazy dog
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400" style={{ fontFamily: fontConfig.customBodyFontName || fontConfig.bodyFont || 'inherit' }}>
              Pack my box with five dozen liquor jugs. Sphinx of black quartz, judge my vow. How vexingly quick daft zebras jump.
            </p>
          </div>
        </div>
      </div>

      {/* Logos */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 space-y-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">Logos</h3>
        {loadingAssets ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BrandAssetUpload
              label="Logo (Light Mode)"
              description="SVG or PNG, shown on light backgrounds"
              assetType="logoLight"
              currentUrl={brandAssets.logoLight}
              accept=".svg,.png,.webp"
              onUploaded={(url) => handleAssetUploaded('logoLight', url)}
            />
            <BrandAssetUpload
              label="Logo (Dark Mode)"
              description="SVG or PNG, shown on dark backgrounds"
              assetType="logoDark"
              currentUrl={brandAssets.logoDark}
              accept=".svg,.png,.webp"
              onUploaded={(url) => handleAssetUploaded('logoDark', url)}
            />
          </div>
        )}
      </div>

      {/* Favicon & OG Image */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 space-y-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">Favicon & Social Image</h3>
        {loadingAssets ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BrandAssetUpload
              label="Favicon"
              description="PNG or ICO, 32x32 or 64x64 recommended"
              assetType="favicon"
              currentUrl={brandAssets.favicon}
              accept=".png,.ico,.svg"
              onUploaded={(url) => handleAssetUploaded('favicon', url)}
            />
            <BrandAssetUpload
              label="OG Image"
              description="1200x630 PNG/JPG, used in social shares"
              assetType="ogImage"
              currentUrl={brandAssets.ogImage}
              accept=".png,.jpg,.jpeg,.webp"
              onUploaded={(url) => handleAssetUploaded('ogImage', url)}
            />
          </div>
        )}
      </div>

      {/* Theme */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">Theme</h3>
        <div className="flex items-center justify-between py-1">
          <div>
            <span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta">Default to dark mode for new visitors</span>
            <p className="text-[11px] text-gray-400 font-jakarta mt-0.5">Users can still toggle their preference</p>
          </div>
          <Toggle value={settings.darkDefault} onChange={(v: boolean) => updateSetting('darkDefault', v)} />
        </div>
      </div>
    </div>
  );
}

function SecuritySection({ settings, updateSetting, Toggle, userRole }: { settings: any; updateSetting: any; Toggle: any; userRole: string }) {
  const isSuperAdmin = userRole === 'SUPER_ADMIN';
  const orgRequires2FA = settings?.require2FA === true;
  const [twoFAStatus, setTwoFAStatus] = useState<{ enabled: boolean; backupCodesRemaining: number } | null>(null);
  const [setupStep, setSetupStep] = useState<'idle' | 'qr' | 'verify' | 'backup' | 'disable'>('idle');
  const [qrCode, setQrCode] = useState('');
  const [manualSecret, setManualSecret] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [copied, setCopied] = useState(false);
  const { update: updateSession } = useSession();

  useEffect(() => {
    fetch('/api/admin/2fa-status').then(r => r.json()).then(data => {
      if (data.success) setTwoFAStatus({ enabled: data.enabled, backupCodesRemaining: data.backupCodesRemaining });
    }).catch(() => {});
  }, []);

  const startSetup = async () => {
    setSetupLoading(true); setSetupError('');
    try {
      const res = await fetch('/api/admin/2fa-setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      });
      const data = await res.json();
      if (data.success) { setQrCode(data.qrCode); setManualSecret(data.secret); setSetupStep('qr'); }
      else setSetupError(data.error);
    } catch { setSetupError('Failed to start setup'); }
    finally { setSetupLoading(false); }
  };

  const verifySetup = async () => {
    if (verifyCode.length !== 6) { setSetupError('Enter a 6-digit code'); return; }
    setSetupLoading(true); setSetupError('');
    try {
      const res = await fetch('/api/admin/2fa-setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', token: verifyCode }),
      });
      const data = await res.json();
      if (data.success) {
        setBackupCodes(data.backupCodes);
        // Enabling with a correct code also completes 2FA for this sign-in (otherwise you'd be asked again).
        if (data.proof) await updateSession({ twoFactorProof: data.proof });
        setSetupStep('backup');
        setTwoFAStatus({ enabled: true, backupCodesRemaining: data.backupCodes.length });
      } else setSetupError(data.error);
    } catch { setSetupError('Verification failed'); }
    finally { setSetupLoading(false); }
  };

  const disable2FA = async () => {
    if (disableCode.length !== 6) { setSetupError('Enter your current 6-digit code'); return; }
    setSetupLoading(true); setSetupError('');
    try {
      const res = await fetch('/api/admin/2fa-disable', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: disableCode }),
      });
      const data = await res.json();
      if (data.success) {
        await updateSession();
        setTwoFAStatus({ enabled: false, backupCodesRemaining: 0 });
        setSetupStep('idle'); setDisableCode('');
      } else setSetupError(data.error);
    } catch { setSetupError('Failed to disable 2FA'); }
    finally { setSetupLoading(false); }
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Security</h2>

      {/* 2FA Section */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
            <Smartphone className="w-4.5 h-4.5 text-brand" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">Two-Factor Authentication</h3>
            <p className="text-xs text-gray-500 font-jakarta">Secure your account with TOTP-based 2FA</p>
          </div>
          {twoFAStatus && (
            <span className={`px-2.5 py-1 text-[11px] font-semibold rounded-full ${twoFAStatus.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
              {twoFAStatus.enabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
        </div>

        {twoFAStatus?.enabled && setupStep === 'idle' && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 font-jakarta">{twoFAStatus.backupCodesRemaining} backup codes remaining</p>
            {orgRequires2FA ? (
              <span className="flex items-center gap-1 text-xs text-gray-400 font-jakarta">
                <AlertTriangle className="w-3 h-3" /> Required by organization
              </span>
            ) : (
              <button onClick={() => setSetupStep('disable')} className="text-xs text-red-500 hover:text-red-600 font-semibold font-jakarta">Disable 2FA</button>
            )}
          </div>
        )}

        {!twoFAStatus?.enabled && setupStep === 'idle' && (
          <button onClick={startSetup} disabled={setupLoading}
            className="w-full py-2.5 text-sm font-semibold rounded-lg bg-brand text-white hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2">
            {setupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            Enable Two-Factor Authentication
          </button>
        )}

        {setupStep === 'qr' && (
          <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-600 dark:text-gray-400 font-jakarta"><span className="font-semibold">Step 1:</span> Scan this QR code with Google Authenticator, Authy, or any TOTP app.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="flex justify-center"><img src={qrCode} alt="2FA QR Code" className="w-48 h-48 rounded-lg border border-gray-200 dark:border-gray-700" /></div>
            <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <p className="text-[10px] text-gray-400 font-jakarta mb-1 uppercase font-semibold">Manual entry key</p>
              <p className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all select-all">{manualSecret}</p>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 font-jakarta"><span className="font-semibold">Step 2:</span> Enter the 6-digit code from your app to verify.</p>
            <div className="flex gap-2">
              <input type="text" inputMode="numeric" maxLength={6} value={verifyCode} onChange={(e) => { setVerifyCode(e.target.value.replace(/\D/g, '')); setSetupError(''); }}
                placeholder="000000" className="flex-1 px-3 py-2.5 text-sm font-mono text-center tracking-[0.3em] border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                onKeyDown={(e) => { if (e.key === 'Enter') verifySetup(); }} />
              <button onClick={verifySetup} disabled={setupLoading || verifyCode.length !== 6}
                className="px-4 py-2.5 text-sm font-semibold rounded-lg bg-brand text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
                {setupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
              </button>
            </div>
            <button onClick={() => { setSetupStep('idle'); setVerifyCode(''); setSetupError(''); }} className="text-xs text-gray-400 hover:text-gray-600 font-jakarta">Cancel</button>
          </div>
        )}

        {setupStep === 'backup' && (
          <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <p className="text-sm font-semibold text-green-700 dark:text-green-400 font-jakarta">2FA enabled successfully!</p>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 font-jakarta">Save these backup codes in a secure location. Each code can only be used once.</p>
            <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700 grid grid-cols-2 gap-2">
              {backupCodes.map((code, i) => (
                <span key={i} className="text-xs font-mono text-gray-700 dark:text-gray-300">{code}</span>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={copyBackupCodes} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy codes'}
              </button>
              <button onClick={() => { setSetupStep('idle'); setBackupCodes([]); setVerifyCode(''); }} className="px-3 py-2 text-xs font-semibold rounded-lg bg-brand text-white hover:opacity-90 transition-opacity">Done</button>
            </div>
          </div>
        )}

        {setupStep === 'disable' && (
          <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" />
              <p className="text-sm font-semibold text-red-600 font-jakarta">Disable Two-Factor Authentication</p>
            </div>
            <p className="text-xs text-gray-500 font-jakarta">Enter your current authenticator code to confirm.</p>
            <div className="flex gap-2">
              <input type="text" inputMode="numeric" maxLength={6} value={disableCode} onChange={(e) => { setDisableCode(e.target.value.replace(/\D/g, '')); setSetupError(''); }}
                placeholder="000000" className="flex-1 px-3 py-2.5 text-sm font-mono text-center tracking-[0.3em] border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                onKeyDown={(e) => { if (e.key === 'Enter') disable2FA(); }} />
              <button onClick={disable2FA} disabled={setupLoading || disableCode.length !== 6}
                className="px-4 py-2.5 text-sm font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors">
                {setupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Disable'}
              </button>
            </div>
            <button onClick={() => { setSetupStep('idle'); setDisableCode(''); setSetupError(''); }} className="text-xs text-gray-400 hover:text-gray-600 font-jakarta">Cancel</button>
          </div>
        )}

        {setupError && <p className="text-xs text-red-500 font-jakarta">{setupError}</p>}
      </div>

      {/* Session & Lockout Info */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">Session & Lockout Policy</h3>
        <div className="space-y-2 text-xs text-gray-600 dark:text-gray-400 font-jakarta">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>Sessions auto-expire after <span className="font-semibold text-gray-900 dark:text-white">15 minutes</span> of inactivity</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>Absolute session limit: <span className="font-semibold text-gray-900 dark:text-white">1 hour</span> (re-login required)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>Account lockout after <span className="font-semibold text-gray-900 dark:text-white">5 failed attempts</span> (15 min cooldown)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>Authentication via <span className="font-semibold text-gray-900 dark:text-white">Google OAuth</span> (no stored passwords)</span>
          </div>
        </div>
      </div>

      {/* Site-wide settings — only SUPER_ADMIN */}
      {isSuperAdmin && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white font-jakarta">Organization Policy</h3>
          <div className="flex items-center justify-between py-1">
            <div>
              <span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta">Require 2FA for all admin users</span>
              <p className="text-xs text-gray-400 font-jakarta mt-0.5">When enabled, all team members must set up 2FA on their next login</p>
            </div>
            <Toggle value={settings.require2FA} onChange={(v: boolean) => updateSetting('require2FA', v)} />
          </div>
        </div>
      )}
    </div>
  );
}
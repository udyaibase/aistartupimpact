'use client';

import { useState, useEffect } from 'react';
import { Save, Check, Loader2, Type } from 'lucide-react';
import { BrandAssetUpload, ColorPicker, FontSelector } from './BrandControls';

export function BrandDesignSection({ settings, updateSetting, Toggle }: { settings: any; updateSetting: any; Toggle: any }) {
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

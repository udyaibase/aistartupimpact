import { prisma } from "@udyaibase/database";
import { cache } from "react";
import { safeBrandColor, safeFontName, safeFontUrl } from "@udyaibase/utils/brand-safe";

export interface BrandConfig {
  logoLight: string | null;
  logoDark: string | null;
  favicon: string | null;
  ogImage: string | null;
  brandColor: string;
  brandSecondary: string;
  brandTertiary: string;
  darkDefault: boolean;
  displayFont: string | null;
  bodyFont: string | null;
  customDisplayFontUrl: string | null;
  customBodyFontUrl: string | null;
  customDisplayFontName: string | null;
  customBodyFontName: string | null;
}

const BRAND_KEYS = [
  "brand_logoLight", "brand_logoDark", "brand_favicon", "brand_ogImage",
  "brandColor", "brandSecondary", "brandTertiary", "darkDefault",
  "brand_displayFont", "brand_bodyFont",
  "brand_customDisplayFontUrl", "brand_customBodyFontUrl",
  "brand_customDisplayFontName", "brand_customBodyFontName",
];

export const getBrandConfig = cache(async (): Promise<BrandConfig> => {
  try {
    const placeholders = BRAND_KEYS.map((_, i) => `$${i + 1}`).join(', ');
    const settings = await prisma.$queryRawUnsafe<Array<{ key: string; value: string }>>(
      `SELECT key, value::text FROM "SiteSetting" WHERE key IN (${placeholders})`,
      ...BRAND_KEYS
    );

    const map: Record<string, any> = {};
    for (const s of settings) {
      try { map[s.key] = JSON.parse(s.value); } catch { map[s.key] = s.value; }
    }

    return {
      logoLight: map.brand_logoLight || null,
      logoDark: map.brand_logoDark || null,
      favicon: map.brand_favicon || null,
      ogImage: map.brand_ogImage || null,
      // Checked again here: these go into a <style> tag on every page (see brand-safe).
      brandColor: safeBrandColor(map.brandColor, "#FF3131"),
      brandSecondary: safeBrandColor(map.brandSecondary, "#1B3A5C"),
      brandTertiary: safeBrandColor(map.brandTertiary, "#F59E0B"),
      darkDefault: map.darkDefault === true,
      displayFont: safeFontName(map.brand_displayFont),
      bodyFont: safeFontName(map.brand_bodyFont),
      customDisplayFontUrl: safeFontUrl(map.brand_customDisplayFontUrl),
      customBodyFontUrl: safeFontUrl(map.brand_customBodyFontUrl),
      customDisplayFontName: safeFontName(map.brand_customDisplayFontName),
      customBodyFontName: safeFontName(map.brand_customBodyFontName),
    };
  } catch (e) {
    console.error('[brand.ts] getBrandConfig error:', e);
    return {
      logoLight: null, logoDark: null, favicon: null, ogImage: null,
      brandColor: "#FF3131", brandSecondary: "#1B3A5C", brandTertiary: "#F59E0B",
      darkDefault: false,
      displayFont: null, bodyFont: null,
      customDisplayFontUrl: null, customBodyFontUrl: null,
      customDisplayFontName: null, customBodyFontName: null,
    };
  }
});

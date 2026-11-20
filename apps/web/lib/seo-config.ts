import { prisma } from "@udyaibase/database";
import { cache } from "react";
import { isWhatsappChannelUrl } from "@/lib/whatsapp-channel";

export interface SeoConfig {
  metaTitle: string;
  metaDescription: string;
  canonicalDomain: string;
  twitterHandle: string;
  gaId: string;
  gscVerification: string;
  noindex: boolean;
  autoSitemap: boolean;
  contactEmail: string;
  socialTwitter: string;
  socialLinkedin: string;
  socialInstagram: string;
  socialFacebook: string;
  socialYoutube: string;
  /** WhatsApp jobs channel invite link; '' when not set (the prompts stay hidden). */
  socialWhatsappChannel: string;
}

const SEO_KEYS = [
  "metaTitle", "metaDescription", "canonicalDomain",
  "seo_twitterHandle", "seo_gaId", "seo_gscVerification", "seo_noindex",
  "autoSitemap", "contactEmail",
  "socialTwitter", "socialLinkedin", "socialInstagram", "socialFacebook", "socialYoutube", "socialWhatsappChannel",
];

const DEFAULTS: SeoConfig = {
  metaTitle: "Udyaibase – AI Startup India News & Funding",
  metaDescription: "Udyaibase is the premier platform for Indian AI news. Discover top artificial intelligence startups, funding, tools, and founder stories.",
  canonicalDomain: "https://udyaibase.com",
  twitterHandle: "@aikitstartup",
  gaId: "",
  gscVerification: "",
  noindex: false,
  autoSitemap: true,
  contactEmail: "hello@udyaibase.com",
  socialTwitter: "https://x.com/udyaibase",
  socialLinkedin: "https://www.linkedin.com/company/udyaibase/",
  socialInstagram: "https://www.instagram.com/udyaibase/",
  socialFacebook: "https://facebook.com/udyaibase",
  socialYoutube: "https://www.youtube.com/@udyaibase",
  socialWhatsappChannel: "",
};

export const getSeoConfig = cache(async (): Promise<SeoConfig> => {
  try {
    const placeholders = SEO_KEYS.map((_, i) => `$${i + 1}`).join(', ');
    const settings = await prisma.$queryRawUnsafe<Array<{ key: string; value: string }>>(
      `SELECT key, value::text FROM "SiteSetting" WHERE key IN (${placeholders})`,
      ...SEO_KEYS
    );

    const map: Record<string, any> = {};
    for (const s of settings) {
      try { map[s.key] = JSON.parse(s.value); } catch { map[s.key] = s.value; }
    }

    return {
      metaTitle: (map.metaTitle as string) || DEFAULTS.metaTitle,
      metaDescription: (map.metaDescription as string) || DEFAULTS.metaDescription,
      canonicalDomain: (map.canonicalDomain as string) || DEFAULTS.canonicalDomain,
      twitterHandle: (map.seo_twitterHandle as string) || DEFAULTS.twitterHandle,
      gaId: (map.seo_gaId as string) || DEFAULTS.gaId,
      gscVerification: (map.seo_gscVerification as string) || DEFAULTS.gscVerification,
      noindex: map.seo_noindex === true,
      autoSitemap: map.autoSitemap !== false,
      contactEmail: (map.contactEmail as string) || DEFAULTS.contactEmail,
      socialTwitter: (map.socialTwitter as string) || DEFAULTS.socialTwitter,
      socialLinkedin: (map.socialLinkedin as string) || DEFAULTS.socialLinkedin,
      socialInstagram: (map.socialInstagram as string) || DEFAULTS.socialInstagram,
      socialFacebook: (map.socialFacebook as string) || DEFAULTS.socialFacebook,
      socialYoutube: (map.socialYoutube as string) || DEFAULTS.socialYoutube,
      // Only a real channel link counts; anything else keeps the prompts hidden.
      socialWhatsappChannel: isWhatsappChannelUrl(map.socialWhatsappChannel) ? String(map.socialWhatsappChannel).trim() : '',
    };
  } catch {
    return { ...DEFAULTS };
  }
});

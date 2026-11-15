/**
 * Professional Newsletter Email Templates — 2026 Industry Grade
 * No headers — content + professional footer only.
 * Red-themed social icons, Hyderabad location, minimal margins.
 */

const SITE_URL = 'https://udyaibase.com';
const YEAR = new Date().getFullYear();

const SOCIAL_LINKS = {
  x: 'https://x.com/udyaibase',
  linkedin: 'https://www.linkedin.com/company/ai-startup-imapact/',
  youtube: 'https://www.youtube.com/@udyaibase',
  instagram: 'https://www.instagram.com/udyaibase',
};

const NAV_LINKS = [
  { label: 'News', url: `${SITE_URL}/news` },
  { label: 'Stories', url: `${SITE_URL}/stories` },
  { label: 'Tools', url: `${SITE_URL}/tools` },
  { label: 'Startups', url: `${SITE_URL}/startups` },
  { label: 'Funding', url: `${SITE_URL}/funding` },
];

const FOOTER_LINKS = [
  { label: 'Unsubscribe', url: `${SITE_URL}/unsubscribe?email={{email}}&token={{unsubToken}}` },
  { label: 'Privacy Policy', url: `${SITE_URL}/privacy` },
  { label: 'Visit Website', url: SITE_URL },
  { label: 'Contact Us', url: `${SITE_URL}/contact` },
];

// ─── Social Icons (red, properly centered in containers) ──────────────────────

function socialIconsHtml(style: 'light' | 'dark' = 'light'): string {
  const isDark = style === 'dark';
  const bgColor = isDark ? 'rgba(239,68,68,0.15)' : '#fef2f2';

  const icons = [
    { url: SOCIAL_LINKS.x, img: 'https://img.icons8.com/ios-filled/32/dc2626/twitterx--v1.png', alt: 'X' },
    { url: SOCIAL_LINKS.linkedin, img: 'https://img.icons8.com/ios-filled/32/dc2626/linkedin.png', alt: 'LinkedIn' },
    { url: SOCIAL_LINKS.youtube, img: 'https://img.icons8.com/ios-filled/32/dc2626/youtube-play.png', alt: 'YouTube' },
    { url: SOCIAL_LINKS.instagram, img: 'https://img.icons8.com/ios-filled/32/dc2626/instagram-new--v1.png', alt: 'Instagram' },
  ];

  // Simple approach: just the icons at proper size, no background containers
  // The icons8 PNGs have built-in padding, so they center themselves
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto"><tr>${icons.map(icon =>
    `<td style="padding:0 8px"><a href="${icon.url}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-block"><img src="${icon.img}" width="28" height="28" alt="${icon.alt}" border="0" style="display:block;border-radius:6px" /></a></td>`
  ).join('')}</tr></table>`;
}

// ─── Footer (minimal padding, responsive) ─────────────────────────────────────

function footerHtml(bgColor: string = '#ffffff', linkColor: string = '#dc2626'): string {
  const isDark = bgColor !== '#ffffff';
  const navColor = isDark ? '#cbd5e1' : '#475569';
  const mutedColor = isDark ? '#64748b' : '#94a3b8';
  const dividerColor = isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0';

  return `<tr><td style="background-color:${bgColor};padding:16px 8px 0">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:18px 0 16px"><tr><td align="center">
${NAV_LINKS.map(l => `<a href="${l.url}" style="color:${navColor};text-decoration:none;font-size:12px;font-weight:600;padding:4px 8px;display:inline-block">${l.label}</a>`).join('')}
</td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:8px 0 20px"><tr><td align="center">
${socialIconsHtml(isDark ? 'dark' : 'light')}
</td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:4px 0 20px"><tr><td align="center">
<p style="color:${mutedColor};font-size:12px;line-height:1.6;margin:0">You're receiving this because you subscribed to Udyaibase. Never spam.</p>
</td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:0 0 16px"><tr><td align="center">
${FOOTER_LINKS.map(l => `<a href="${l.url}" style="color:${linkColor};text-decoration:none;font-size:11px;font-weight:500;padding:2px 6px;display:inline-block">${l.label}</a>`).join(`<span style="color:${mutedColor};font-size:11px">·</span>`)}
</td></tr></table>
<div style="height:12px;line-height:12px;font-size:1px">&nbsp;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:0 0 0"><tr><td align="center">
<p style="color:${mutedColor};font-size:10px;margin:0;opacity:0.7">© ${YEAR} Udyaibase · Hyderabad, India</p>
</td></tr></table>
<div style="height:20px;line-height:20px;font-size:1px">&nbsp;</div>
</td></tr>`;
}

// ─── Template Config ──────────────────────────────────────────────────────────

export interface TemplateConfig {
  id: string;
  name: string;
  description: string;
  preview: string;
}

export const NEWSLETTER_TEMPLATES: TemplateConfig[] = [
  { id: 'minimal', name: 'Minimal', description: 'Clean white. Content-first. Maximum readability.', preview: 'White, serif heading' },
  { id: 'bold', name: 'Bold', description: 'Dark footer. High contrast. Tech-forward.', preview: 'Dark footer, bold type' },
  { id: 'classic', name: 'Classic', description: 'Traditional editorial. Red accent bar.', preview: 'Accent bar, serif heading' },
  { id: 'modern', name: 'Modern', description: 'Rounded, soft shadow. Contemporary.', preview: 'Rounded, soft shadow' },
];

// ─── TEMPLATES (no headers, minimal L/R padding) ──────────────────────────────

// Inline styles for common content elements (email clients strip <style> blocks)
// This style block is for the live preview iframe ONLY — actual emails use inlined styles
const CONTENT_STYLES = `<style>
.cta-block{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin:24px 0;text-align:center}
.cta-title{color:#0f172a;font-size:20px;font-weight:700;margin:0 0 8px}
.cta-text{color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px}
.cta-btn{display:inline-block;background:#dc2626;color:#ffffff!important;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px}
h2{color:#0f172a;font-size:22px;font-weight:700;margin:28px 0 12px}
h3{color:#0f172a;font-size:18px;font-weight:700;margin:24px 0 8px}
blockquote{border-left:3px solid #dc2626;padding:12px 16px;margin:16px 0;background:#fef2f2;color:#334155;font-style:italic}
ul,ol{padding-left:20px;margin:12px 0}
li{margin:6px 0;color:#475569;line-height:1.6}
a{color:#dc2626;text-decoration:underline}
img{max-width:100%;height:auto;border-radius:8px;margin:16px 0}
hr{border:none;border-top:1px solid #e2e8f0;margin:24px 0}
</style>`;

// Inliner: converts class-based styles to inline for email compatibility
function inlineContentStyles(html: string): string {
  if (!html) return html;
  
  // CTA block — handle both class="..." and class='...'
  html = html.replace(/class=["']cta-block["']/g, 'style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin:24px 0;text-align:center"');
  html = html.replace(/class=["']cta-title["']/g, 'style="color:#0f172a;font-size:20px;font-weight:700;margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif"');
  html = html.replace(/class=["']cta-text["']/g, 'style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px"');
  html = html.replace(/class=["']cta-btn["']/g, 'style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 24px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif"');
  
  // Section/highlight blocks
  html = html.replace(/class=["']highlight["']/g, 'style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px 20px;margin:20px 0;border-radius:0 8px 8px 0"');
  html = html.replace(/class=["']note["']/g, 'style="background:#f0f9ff;border:1px solid #bae6fd;padding:16px 20px;margin:20px 0;border-radius:8px;color:#0c4a6e"');
  
  // Headings — only add style if no style attribute already exists
  html = html.replace(/<h2(?![^>]*style)([^>]*)>/g, '<h2 style="color:#0f172a;font-size:22px;font-weight:700;margin:28px 0 12px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif"$1>');
  html = html.replace(/<h3(?![^>]*style)([^>]*)>/g, '<h3 style="color:#0f172a;font-size:18px;font-weight:700;margin:24px 0 8px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif"$1>');
  html = html.replace(/<h4(?![^>]*style)([^>]*)>/g, '<h4 style="color:#0f172a;font-size:16px;font-weight:700;margin:20px 0 8px"$1>');
  
  // Paragraphs — add line-height if no style
  html = html.replace(/<p(?![^>]*style)([^>]*)>/g, '<p style="color:#475569;font-size:16px;line-height:1.75;margin:0 0 16px"$1>');
  
  // Blockquote
  html = html.replace(/<blockquote(?![^>]*style)([^>]*)>/g, '<blockquote style="border-left:3px solid #dc2626;padding:12px 16px;margin:16px 0;background:#fef2f2;color:#334155;font-style:italic"$1>');
  
  // Lists
  html = html.replace(/<ul(?![^>]*style)([^>]*)>/g, '<ul style="padding-left:20px;margin:12px 0"$1>');
  html = html.replace(/<ol(?![^>]*style)([^>]*)>/g, '<ol style="padding-left:20px;margin:12px 0"$1>');
  html = html.replace(/<li(?![^>]*style)([^>]*)>/g, '<li style="margin:6px 0;color:#475569;line-height:1.6;font-size:16px"$1>');
  
  // Links — make red, keep underline
  html = html.replace(/<a(?![^>]*style)([^>]*)>/g, '<a style="color:#dc2626;text-decoration:underline;font-weight:500"$1>');
  
  // Images
  html = html.replace(/<img(?![^>]*style)([^>]*?)(\s*\/?>)/g, '<img style="max-width:100%;height:auto;border-radius:8px;margin:16px 0;display:block"$1$2');
  
  // HR
  html = html.replace(/<hr(?![^>]*style)([^>]*?)(\s*\/?>)/g, '<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"$1$2');
  
  // Strong/Bold
  html = html.replace(/<strong(?![^>]*style)([^>]*)>/g, '<strong style="color:#0f172a;font-weight:700"$1>');
  
  // Code inline
  html = html.replace(/<code(?![^>]*style)([^>]*)>/g, '<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:14px;font-family:monospace;color:#dc2626"$1>');
  
  // Pre/code blocks
  html = html.replace(/<pre(?![^>]*style)([^>]*)>/g, '<pre style="background:#1e293b;color:#e2e8f0;padding:16px 20px;border-radius:8px;overflow-x:auto;font-size:14px;line-height:1.5;margin:16px 0"$1>');
  
  return html;
}

function templateMinimal(subject: string, body: string): string {
  const styledBody = inlineContentStyles(body);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${subject}</title>${CONTENT_STYLES}</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;width:100%">
<tr><td style="padding:20px 8px 24px">
<h1 style="color:#0f172a;font-size:28px;font-weight:700;line-height:1.25;margin:0 0 20px;font-family:Georgia,serif">${subject}</h1>
<div style="color:#334155;font-size:16px;line-height:1.8">${styledBody || '<p style="color:#94a3b8;font-style:italic">Start typing to see your content here...</p>'}</div>
</td></tr>
${footerHtml('#ffffff', '#475569')}
</table>
</td></tr></table></body></html>`;
}

function templateBold(subject: string, body: string): string {
  const styledBody = inlineContentStyles(body);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${subject}</title>${CONTENT_STYLES}</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#0f172a">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;width:100%;border-radius:12px;overflow:hidden">
<tr><td style="background:#ffffff;padding:24px 8px">
<h1 style="color:#0f172a;font-size:26px;font-weight:800;line-height:1.25;margin:0 0 20px">${subject}</h1>
<div style="color:#475569;font-size:16px;line-height:1.75">${styledBody || '<p style="color:#94a3b8;font-style:italic">Start typing to see your content here...</p>'}</div>
</td></tr>
${footerHtml('#1e293b', '#a5b4fc')}
</table>
</td></tr></table></body></html>`;
}

function templateClassic(subject: string, body: string): string {
  const styledBody = inlineContentStyles(body);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${subject}</title>${CONTENT_STYLES}</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:4px;overflow:hidden">
<tr><td style="padding:24px 8px">
<h1 style="color:#0f172a;font-size:24px;font-weight:700;line-height:1.3;margin:0 0 6px;font-family:Georgia,'Times New Roman',serif">${subject}</h1>
<div style="width:50px;height:3px;background:#dc2626;margin:0 0 20px;border-radius:2px"></div>
<div style="color:#334155;font-size:16px;line-height:1.75">${styledBody || '<p style="color:#94a3b8;font-style:italic">Start typing to see your content here...</p>'}</div>
</td></tr>
${footerHtml('#ffffff', '#dc2626')}
</table>
</td></tr></table></body></html>`;
}

function templateModern(subject: string, body: string): string {
  const styledBody = inlineContentStyles(body);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${subject}</title>${CONTENT_STYLES}</head>
<body style="margin:0;padding:0;background:#f4f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f7fa">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.05)">
<tr><td style="padding:24px 8px">
<h1 style="color:#0f172a;font-size:24px;font-weight:700;line-height:1.3;margin:0 0 18px">${subject}</h1>
<div style="color:#475569;font-size:16px;line-height:1.75">${styledBody || '<p style="color:#94a3b8;font-style:italic">Start typing to see your content here...</p>'}</div>
</td></tr>
${footerHtml('#ffffff', '#dc2626')}
</table>
</td></tr></table></body></html>`;
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────

export function generateNewsletterHtml(templateId: string, subject: string, body: string): string {
  switch (templateId) {
    case 'minimal': return templateMinimal(subject, body);
    case 'bold': return templateBold(subject, body);
    case 'classic': return templateClassic(subject, body);
    case 'modern': return templateModern(subject, body);
    default: return templateModern(subject, body);
  }
}



export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Plain-text occurrences, case-insensitive. No regex, so any keyword is safe. */
export function countOccurrences(text: string, keyword: string): number {
  const hay = text.toLowerCase();
  const needle = keyword.toLowerCase().trim();
  if (!needle) return 0;
  let count = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) count++;
  return count;
}

/** One attribute's value, in double or single quotes, so an apostrophe inside alt text doesn't cut it short. */
export function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] ?? m[2] ?? '') : '';
}

/**
 * Strip HTML tags
 */
export function stripHTML(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Generate LSI (Latent Semantic Indexing) keywords
 */
export function generateLSIKeywords(focusKeyword: string): string[] {
  // Simplified LSI generation - in production, use an API
  const words = focusKeyword.toLowerCase().split(/\s+/);
  const lsi: string[] = [];
  
  // Add plurals
  words.forEach(word => {
    if (!word.endsWith('s')) lsi.push(word + 's');
  });
  
  // Add common variations
  if (/\bai\b/i.test(focusKeyword)) {
    lsi.push('artificial intelligence', 'machine learning', 'AI technology');
  }
  if (/startup/i.test(focusKeyword)) {
    lsi.push('startups', 'company', 'business', 'venture');
  }
  if (/india/i.test(focusKeyword)) {
    lsi.push('Indian', 'India\'s', 'Bharat');
  }
  
  return lsi;
}

export function decodeEntities(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

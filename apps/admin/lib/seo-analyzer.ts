/**
 * Industry-Grade SEO Analyzer
 * Provides comprehensive SEO scoring and recommendations
 */

export interface SEOAnalysis {
  score: number; // 0-100
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  issues: SEOIssue[];
  recommendations: SEORecommendation[];
  breakdown: {
    title: { score: number; max: number };
    description: { score: number; max: number };
    content: { score: number; max: number };
    keywords: { score: number; max: number };
    images: { score: number; max: number };
    readability: { score: number; max: number };
    technical: { score: number; max: number };
  };
}

export interface SEOIssue {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  fix: string;
}

export interface SEORecommendation {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
}

export interface ImageAnalysis {
  src: string;
  hasAlt: boolean;
  altText: string;
  altLength: number;
  isOptimal: boolean;
  suggestions: string[];
}

/**
 * Analyze article SEO comprehensively
 */
export function analyzeSEO(data: {
  title: string;
  seoTitle: string;
  metaDescription: string;
  focusKeyword: string;
  content: string;
  slug: string;
  images: ImageAnalysis[];
}): SEOAnalysis {
  const issues: SEOIssue[] = [];
  const recommendations: SEORecommendation[] = [];
  
  // Title Analysis (20 points)
  const titleScore = analyzeTitleSEO(data.title, data.seoTitle, data.focusKeyword, issues, recommendations);
  
  // Meta Description Analysis (15 points)
  const descScore = analyzeMetaDescription(data.metaDescription, data.focusKeyword, issues, recommendations);
  
  // Content Analysis (25 points)
  const contentScore = analyzeContent(data.content, data.focusKeyword, issues, recommendations);
  
  // Keyword Analysis (15 points)
  const keywordScore = analyzeKeywords(data.focusKeyword, data.title, data.content, issues, recommendations);
  
  // Image Analysis (10 points)
  const imageScore = analyzeImages(data.images, issues, recommendations);
  
  // Readability Analysis (10 points)
  const readabilityScore = analyzeReadability(data.content, issues, recommendations);
  
  // Technical SEO (5 points)
  const technicalScore = analyzeTechnical(data.slug, data.title, issues, recommendations);
  
  // Calculate total score
  const totalScore = Math.round(
    titleScore + descScore + contentScore + keywordScore + 
    imageScore + readabilityScore + technicalScore
  );
  
  // Determine grade
  const grade = getGrade(totalScore);
  
  return {
    score: totalScore,
    grade,
    issues,
    recommendations,
    breakdown: {
      title: { score: titleScore, max: 20 },
      description: { score: descScore, max: 15 },
      content: { score: contentScore, max: 25 },
      keywords: { score: keywordScore, max: 15 },
      images: { score: imageScore, max: 10 },
      readability: { score: readabilityScore, max: 10 },
      technical: { score: technicalScore, max: 5 },
    },
  };
}

/**
 * Analyze Title SEO (20 points max)
 */
function analyzeTitleSEO(
  title: string,
  seoTitle: string,
  focusKeyword: string,
  issues: SEOIssue[],
  recommendations: SEORecommendation[]
): number {
  let score = 0;
  const effectiveTitle = seoTitle || title;
  
  // Length check (5 points)
  if (effectiveTitle.length >= 30 && effectiveTitle.length <= 60) {
    score += 5;
  } else if (effectiveTitle.length < 30) {
    issues.push({
      severity: 'warning',
      category: 'Title',
      message: 'Title is too short',
      fix: `Expand title to 30-60 characters (currently ${effectiveTitle.length})`,
    });
    score += 2;
  } else if (effectiveTitle.length > 60) {
    issues.push({
      severity: 'warning',
      category: 'Title',
      message: 'Title is too long',
      fix: `Shorten title to 60 characters or less (currently ${effectiveTitle.length})`,
    });
    score += 3;
  }
  
  // Keyword in title (8 points)
  if (focusKeyword && effectiveTitle.toLowerCase().includes(focusKeyword.toLowerCase())) {
    score += 8;
  } else if (focusKeyword) {
    issues.push({
      severity: 'critical',
      category: 'Title',
      message: 'Focus keyword not in title',
      fix: `Include "${focusKeyword}" in your title for better SEO`,
    });
    recommendations.push({
      priority: 'high',
      title: 'Add Focus Keyword to Title',
      description: `Your focus keyword "${focusKeyword}" should appear in the title`,
      impact: 'High - Titles with keywords rank 30% better',
    });
  }
  
  // Keyword position (4 points)
  const keywordAt = focusKeyword ? effectiveTitle.toLowerCase().indexOf(focusKeyword.toLowerCase()) : -1;
  if (keywordAt >= 0 && keywordAt < 20) {
    score += 4;
  } else if (focusKeyword && effectiveTitle.toLowerCase().includes(focusKeyword.toLowerCase())) {
    score += 2;
    recommendations.push({
      priority: 'medium',
      title: 'Move Keyword Earlier in Title',
      description: 'Keywords at the beginning of titles perform better',
      impact: 'Medium - Can improve CTR by 10-15%',
    });
  }
  
  // Power words check (3 points)
  const powerWords = ['best', 'guide', 'ultimate', 'complete', 'essential', 'proven', 'expert', 'top', 'new', '2026'];
  const hasPowerWord = powerWords.some(word => effectiveTitle.toLowerCase().includes(word));
  if (hasPowerWord) {
    score += 3;
  } else {
    recommendations.push({
      priority: 'low',
      title: 'Add Power Words',
      description: 'Include words like "Best", "Guide", "Ultimate" to improve CTR',
      impact: 'Low - Can increase clicks by 5-10%',
    });
  }
  
  return score;
}

/**
 * Analyze Meta Description (15 points max)
 */
function analyzeMetaDescription(
  metaDesc: string,
  focusKeyword: string,
  issues: SEOIssue[],
  recommendations: SEORecommendation[]
): number {
  let score = 0;
  
  if (!metaDesc || metaDesc.trim().length === 0) {
    issues.push({
      severity: 'critical',
      category: 'Meta Description',
      message: 'Meta description is missing',
      fix: 'Write a compelling 120-160 character description',
    });
    return 0;
  }
  
  // Length check (5 points)
  if (metaDesc.length >= 120 && metaDesc.length <= 160) {
    score += 5;
  } else if (metaDesc.length < 120) {
    issues.push({
      severity: 'warning',
      category: 'Meta Description',
      message: 'Meta description is too short',
      fix: `Expand to 120-160 characters (currently ${metaDesc.length})`,
    });
    score += 2;
  } else if (metaDesc.length > 160) {
    issues.push({
      severity: 'warning',
      category: 'Meta Description',
      message: 'Meta description is too long',
      fix: `Shorten to 160 characters or less (currently ${metaDesc.length})`,
    });
    score += 3;
  }
  
  // Keyword in description (7 points)
  if (focusKeyword && metaDesc.toLowerCase().includes(focusKeyword.toLowerCase())) {
    score += 7;
  } else if (focusKeyword) {
    issues.push({
      severity: 'critical',
      category: 'Meta Description',
      message: 'Focus keyword not in meta description',
      fix: `Include "${focusKeyword}" naturally in the description`,
    });
  }
  
  // Call to action (3 points)
  const ctaWords = ['learn', 'discover', 'find out', 'read', 'explore', 'get', 'see how'];
  const hasCTA = ctaWords.some(word => metaDesc.toLowerCase().includes(word));
  if (hasCTA) {
    score += 3;
  } else {
    recommendations.push({
      priority: 'medium',
      title: 'Add Call-to-Action',
      description: 'Include action words like "Learn", "Discover", "Find out"',
      impact: 'Medium - Can improve CTR by 15-20%',
    });
  }
  
  return score;
}

/**
 * Analyze Content (25 points max)
 */
function analyzeContent(
  content: string,
  focusKeyword: string,
  issues: SEOIssue[],
  recommendations: SEORecommendation[]
): number {
  let score = 0;
  const text = stripHTML(content);
  const wordCount = countWords(text);
  
  // Word count (8 points)
  if (wordCount >= 1000) {
    score += 8;
  } else if (wordCount >= 600) {
    score += 5;
    recommendations.push({
      priority: 'medium',
      title: 'Expand Content Length',
      description: `Aim for 1000+ words for better SEO (currently ${wordCount})`,
      impact: 'Medium - Longer content ranks 20% better',
    });
  } else if (wordCount >= 300) {
    score += 3;
    issues.push({
      severity: 'warning',
      category: 'Content',
      message: 'Content is too short',
      fix: `Expand to at least 600 words (currently ${wordCount})`,
    });
  } else {
    issues.push({
      severity: 'critical',
      category: 'Content',
      message: 'Content is critically short',
      fix: `Write at least 300 words (currently ${wordCount})`,
    });
  }
  
  // Keyword density (7 points)
  if (focusKeyword) {
    const keywordCount = countOccurrences(text, focusKeyword);
    const density = wordCount ? (keywordCount / wordCount) * 100 : 0;
    
    if (density >= 0.5 && density <= 2.5) {
      score += 7;
    } else if (density < 0.5) {
      issues.push({
        severity: 'warning',
        category: 'Keywords',
        message: 'Keyword density too low',
        fix: `Use "${focusKeyword}" more naturally (${keywordCount} times, ${density.toFixed(2)}%)`,
      });
      score += 3;
    } else if (density > 2.5) {
      issues.push({
        severity: 'warning',
        category: 'Keywords',
        message: 'Keyword density too high (keyword stuffing)',
        fix: `Reduce usage of "${focusKeyword}" (${keywordCount} times, ${density.toFixed(2)}%)`,
      });
      score += 4;
    }
  }
  
  // Headings structure (5 points)
  const h2Count = (content.match(/<h2[\s>]/gi) || []).length;
  const h3Count = (content.match(/<h3[\s>]/gi) || []).length;
  
  if (h2Count >= 2 && h3Count >= 1) {
    score += 5;
  } else if (h2Count >= 1) {
    score += 3;
    recommendations.push({
      priority: 'medium',
      title: 'Add More Headings',
      description: 'Use at least 2-3 H2 headings and subheadings',
      impact: 'Medium - Improves readability and SEO',
    });
  } else {
    issues.push({
      severity: 'warning',
      category: 'Content Structure',
      message: 'Missing headings',
      fix: 'Add H2 and H3 headings to structure your content',
    });
    score += 1;
  }
  
  // Paragraph length (3 points)
  const paragraphs = content.split(/<\/p>/).filter(p => stripHTML(p).trim().length > 0);
  const avgParagraphLength = paragraphs.length
    ? paragraphs.reduce((sum, p) => sum + countWords(stripHTML(p)), 0) / paragraphs.length
    : 0;
  
  if (paragraphs.length > 0 && avgParagraphLength <= 100) {
    score += 3;
  } else {
    recommendations.push({
      priority: 'low',
      title: 'Shorten Paragraphs',
      description: 'Keep paragraphs under 100 words for better readability',
      impact: 'Low - Improves user experience',
    });
    score += 1;
  }
  
  // Links (2 points)
  const linkCount = (content.match(/<a\s[^>]*href=/gi) || []).length;
  if (linkCount >= 2) {
    score += 2;
  } else {
    recommendations.push({
      priority: 'low',
      title: 'Add Internal/External Links',
      description: 'Include 2-3 relevant links to improve SEO',
      impact: 'Low - Helps with crawlability and authority',
    });
  }
  
  return score;
}

/**
 * Analyze Keywords (15 points max)
 */
function analyzeKeywords(
  focusKeyword: string,
  title: string,
  content: string,
  issues: SEOIssue[],
  recommendations: SEORecommendation[]
): number {
  let score = 0;
  
  if (!focusKeyword || focusKeyword.trim().length === 0) {
    issues.push({
      severity: 'critical',
      category: 'Keywords',
      message: 'No focus keyword set',
      fix: 'Set a focus keyword for this article',
    });
    return 0;
  }
  
  // Keyword length (3 points)
  const keywordWords = focusKeyword.split(/\s+/).length;
  if (keywordWords >= 2 && keywordWords <= 4) {
    score += 3;
  } else if (keywordWords === 1) {
    recommendations.push({
      priority: 'medium',
      title: 'Use Long-Tail Keywords',
      description: 'Use 2-4 word phrases instead of single words',
      impact: 'Medium - Long-tail keywords convert 2.5x better',
    });
    score += 1;
  }
  
  // Keyword in first paragraph (5 points)
  const firstParagraph = stripHTML(content.split('</p>')[0] || '');
  if (firstParagraph.toLowerCase().includes(focusKeyword.toLowerCase())) {
    score += 5;
  } else {
    issues.push({
      severity: 'warning',
      category: 'Keywords',
      message: 'Keyword not in first paragraph',
      fix: `Include "${focusKeyword}" in the opening paragraph`,
    });
  }
  
  // Keyword in headings (4 points)
  const headings = content.match(/<h[2-3][^>]*>[\s\S]*?<\/h[2-3]>/gi) || [];
  const keywordInHeading = headings.some(h => stripHTML(h).toLowerCase().includes(focusKeyword.toLowerCase()));
  if (keywordInHeading) {
    score += 4;
  } else {
    recommendations.push({
      priority: 'medium',
      title: 'Use Keyword in Headings',
      description: `Include "${focusKeyword}" in at least one H2 or H3`,
      impact: 'Medium - Strengthens topical relevance',
    });
  }
  
  // LSI keywords (3 points) - simplified check
  const lsiKeywords = generateLSIKeywords(focusKeyword);
  const hasLSI = lsiKeywords.some(lsi => content.toLowerCase().includes(lsi.toLowerCase()));
  if (hasLSI) {
    score += 3;
  } else {
    recommendations.push({
      priority: 'low',
      title: 'Add Related Keywords',
      description: `Include variations like: ${lsiKeywords.slice(0, 3).join(', ')}`,
      impact: 'Low - Improves semantic SEO',
    });
  }
  
  return score;
}

/**
 * Analyze Images (10 points max)
 */
function analyzeImages(
  images: ImageAnalysis[],
  issues: SEOIssue[],
  recommendations: SEORecommendation[]
): number {
  let score = 0;
  
  if (images.length === 0) {
    recommendations.push({
      priority: 'medium',
      title: 'Add Images',
      description: 'Include at least 1-2 relevant images',
      impact: 'Medium - Images improve engagement by 40%',
    });
    return 0;
  }
  
  // Has images (3 points)
  score += 3;
  
  // Alt text coverage (5 points)
  const imagesWithAlt = images.filter(img => img.hasAlt && img.altText.length > 0).length;
  const altCoverage = (imagesWithAlt / images.length) * 100;
  
  if (altCoverage === 100) {
    score += 5;
  } else if (altCoverage >= 75) {
    score += 3;
    issues.push({
      severity: 'warning',
      category: 'Images',
      message: `${images.length - imagesWithAlt} images missing alt text`,
      fix: 'Add descriptive alt text to all images',
    });
  } else {
    issues.push({
      severity: 'critical',
      category: 'Images',
      message: `${images.length - imagesWithAlt} images missing alt text`,
      fix: 'Add descriptive alt text to all images for accessibility and SEO',
    });
    score += 1;
  }
  
  // Alt text quality (2 points)
  const optimalAltCount = images.filter(img => img.isOptimal).length;
  if (optimalAltCount === images.length) {
    score += 2;
  } else if (optimalAltCount > 0) {
    score += 1;
    recommendations.push({
      priority: 'medium',
      title: 'Improve Alt Text Quality',
      description: 'Make alt text descriptive (5-15 words) and include keywords naturally',
      impact: 'Medium - Better alt text improves image SEO',
    });
  }
  
  return score;
}

/**
 * Analyze Readability (10 points max)
 */
function analyzeReadability(
  content: string,
  issues: SEOIssue[],
  recommendations: SEORecommendation[]
): number {
  let score = 0;
  const text = stripHTML(content);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text ? text.split(/\s+/) : [];
  
  if (sentences.length === 0 || words.length === 0) return 0;
  
  // Average sentence length (4 points)
  const avgSentenceLength = words.length / sentences.length;
  if (avgSentenceLength <= 20) {
    score += 4;
  } else if (avgSentenceLength <= 25) {
    score += 2;
    recommendations.push({
      priority: 'low',
      title: 'Shorten Sentences',
      description: 'Keep sentences under 20 words for better readability',
      impact: 'Low - Improves user experience',
    });
  } else {
    issues.push({
      severity: 'info',
      category: 'Readability',
      message: 'Sentences are too long',
      fix: `Average sentence length is ${avgSentenceLength.toFixed(1)} words (aim for <20)`,
    });
    score += 1;
  }
  
  // Transition words (3 points)
  const transitionWords = ['however', 'therefore', 'moreover', 'furthermore', 'additionally', 'consequently', 'meanwhile', 'nevertheless'];
  const hasTransitions = transitionWords.some(word => text.toLowerCase().includes(word));
  if (hasTransitions) {
    score += 3;
  } else {
    recommendations.push({
      priority: 'low',
      title: 'Use Transition Words',
      description: 'Add words like "however", "therefore", "moreover" for flow',
      impact: 'Low - Improves readability score',
    });
  }
  
  // Lists and formatting (3 points)
  const hasLists = /<(ul|ol)[\s>]/i.test(content);
  const hasBold = /<(strong|b)[\s>]/i.test(content);
  
  if (hasLists && hasBold) {
    score += 3;
  } else if (hasLists || hasBold) {
    score += 2;
    recommendations.push({
      priority: 'low',
      title: 'Add More Formatting',
      description: 'Use lists, bold text, and other formatting for scannability',
      impact: 'Low - Improves user engagement',
    });
  } else {
    recommendations.push({
      priority: 'medium',
      title: 'Add Lists and Formatting',
      description: 'Use bullet points, numbered lists, and bold text',
      impact: 'Medium - Makes content more scannable',
    });
  }
  
  return score;
}

/**
 * Analyze Technical SEO (5 points max)
 */
function analyzeTechnical(
  slug: string,
  title: string,
  issues: SEOIssue[],
  recommendations: SEORecommendation[]
): number {
  let score = 0;
  
  // Slug quality (3 points)
  if (slug && slug.length > 0) {
    const slugWords = slug.split('-').length;
    if (slugWords >= 3 && slugWords <= 6 && slug.length <= 60) {
      score += 3;
    } else if (slug.length > 60) {
      issues.push({
        severity: 'info',
        category: 'Technical',
        message: 'URL slug is too long',
        fix: 'Keep URL slugs under 60 characters',
      });
      score += 1;
    } else {
      score += 2;
    }
  } else {
    issues.push({
      severity: 'warning',
      category: 'Technical',
      message: 'No custom URL slug',
      fix: 'Set a descriptive URL slug',
    });
  }
  
  // Title uniqueness (2 points)
  if (title && title.length > 0) {
    score += 2;
  }
  
  return score;
}

/**
 * Get grade from score
 */
function getGrade(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Plain-text occurrences, case-insensitive. No regex, so any keyword is safe. */
function countOccurrences(text: string, keyword: string): number {
  const hay = text.toLowerCase();
  const needle = keyword.toLowerCase().trim();
  if (!needle) return 0;
  let count = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) count++;
  return count;
}

/** One attribute's value, in double or single quotes, so an apostrophe inside alt text doesn't cut it short. */
function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] ?? m[2] ?? '') : '';
}

/**
 * Strip HTML tags
 */
function stripHTML(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Generate LSI (Latent Semantic Indexing) keywords
 */
function generateLSIKeywords(focusKeyword: string): string[] {
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

/**
 * Analyze images in content
 */
export function analyzeContentImages(htmlContent: string, focusKeyword: string): ImageAnalysis[] {
  const tags = htmlContent.match(/<img\b[^>]*>/gi) || [];
  return tags.map(tag => describeImage(attr(tag, 'src'), decodeEntities(attr(tag, 'alt')).trim(), focusKeyword));
}

/**
 * The cover image, as readers and search engines see it: the article page shows it with the article title as its
 * alt text, so that is what gets scored.
 */
export function analyzeCoverImage(src: string | null | undefined, title: string, focusKeyword: string): ImageAnalysis[] {
  return src ? [describeImage(src, title.trim(), focusKeyword)] : [];
}

function describeImage(src: string, altText: string, focusKeyword: string): ImageAnalysis {
  const hasAlt = altText.length > 0;
  const altLength = countWords(altText);
  const suggestions: string[] = [];
  let isOptimal = true;

  if (!hasAlt) {
    suggestions.push('Add descriptive alt text');
    isOptimal = false;
  } else {
    if (altLength < 5) {
      suggestions.push('Make alt text more descriptive (5-15 words)');
      isOptimal = false;
    }
    if (altLength > 15) {
      suggestions.push('Shorten alt text (keep under 15 words)');
      isOptimal = false;
    }
    if (focusKeyword && !altText.toLowerCase().includes(focusKeyword.toLowerCase())) {
      suggestions.push(`Consider including "${focusKeyword}" naturally`);
    }
  }

  return { src, hasAlt, altText, altLength, isOptimal, suggestions };
}

function decodeEntities(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

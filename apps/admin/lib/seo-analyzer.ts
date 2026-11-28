import { analyzeTitleSEO, analyzeMetaDescription, analyzeContent, analyzeKeywords } from './seo-checks-content';
import { analyzeImages, analyzeReadability, analyzeTechnical } from './seo-checks-quality';
import { countWords, attr, decodeEntities } from './seo-text';
import { SEOAnalysis, SEOIssue, SEORecommendation, ImageAnalysis } from './seo-types';

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

import { countWords, countOccurrences, stripHTML, generateLSIKeywords } from './seo-text';
import { SEOIssue, SEORecommendation } from './seo-types';

/**
 * Analyze Title SEO (20 points max)
 */
export function analyzeTitleSEO(
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
export function analyzeMetaDescription(
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
export function analyzeContent(
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
export function analyzeKeywords(
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

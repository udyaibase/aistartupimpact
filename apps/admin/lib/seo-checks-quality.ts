import { stripHTML } from './seo-text';
import { SEOIssue, SEORecommendation, ImageAnalysis } from './seo-types';

/**
 * Analyze Images (10 points max)
 */
export function analyzeImages(
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
export function analyzeReadability(
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
export function analyzeTechnical(
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

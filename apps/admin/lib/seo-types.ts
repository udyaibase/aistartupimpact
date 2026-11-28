

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

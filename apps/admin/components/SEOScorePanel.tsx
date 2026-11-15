'use client';

import { useEffect, useState } from 'react';
import { 
  TrendingUp, AlertCircle, CheckCircle, Info, ChevronDown, ChevronUp,
  Target, FileText, Image, BookOpen, Code, Zap
} from 'lucide-react';
import { generateSlug } from '@udyaibase/utils/slug';
import { analyzeSEO, analyzeContentImages, analyzeCoverImage, type SEOAnalysis, type SEOIssue, type SEORecommendation } from '../lib/seo-analyzer';

interface SEOScorePanelProps {
  title: string;
  seoTitle: string;
  metaDescription: string;
  focusKeyword: string;
  content: string;
  slug: string;
  /** Used as the meta description when none is set, as the article page does. */
  subtitle?: string;
  /** Shown at the top of the article, so it counts as the article's main image. */
  coverImage?: string | null;
}

export default function SEOScorePanel({
  title,
  seoTitle,
  metaDescription,
  focusKeyword,
  content,
  slug,
  subtitle = '',
  coverImage = null,
}: SEOScorePanelProps) {
  const [analysis, setAnalysis] = useState<SEOAnalysis | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'issues' | 'recommendations'>('overview');

  useEffect(() => {
    // Analyze SEO whenever inputs change
    // Score what the published page will actually have: the cover image, the subtitle as a fallback description,
    // and the address made from the title when no slug is set yet.
    const images = [...analyzeCoverImage(coverImage, title, focusKeyword), ...analyzeContentImages(content, focusKeyword)];
    const result = analyzeSEO({
      title,
      seoTitle,
      metaDescription: metaDescription.trim() || subtitle.trim(),
      focusKeyword,
      content,
      slug: slug.trim() || generateSlug(title),
      images,
    });
    setAnalysis(result);
  }, [title, seoTitle, metaDescription, focusKeyword, content, slug, subtitle, coverImage]);

  if (!analysis) return null;

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-green-600 dark:text-green-400';
    if (score >= 70) return 'text-blue-600 dark:text-blue-400';
    if (score >= 55) return 'text-yellow-600 dark:text-yellow-400';
    if (score >= 40) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 85) return 'bg-green-100 dark:bg-green-900/30';
    if (score >= 70) return 'bg-blue-100 dark:bg-blue-900/30';
    if (score >= 55) return 'bg-yellow-100 dark:bg-yellow-900/30';
    if (score >= 40) return 'bg-orange-100 dark:bg-orange-900/30';
    return 'bg-red-100 dark:bg-red-900/30';
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'warning': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default: return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getPriorityBadge = (priority: string) => {
    const colors = {
      high: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
      medium: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
      low: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    };
    return colors[priority as keyof typeof colors] || colors.low;
  };

  const criticalIssues = analysis.issues.filter(i => i.severity === 'critical');
  const warningIssues = analysis.issues.filter(i => i.severity === 'warning');

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-5 bg-gradient-to-r from-brand/5 to-purple-500/5 hover:from-brand/10 hover:to-purple-500/10 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 rounded-2xl ${getScoreBg(analysis.score)} flex items-center justify-center`}>
            <div className="text-center">
              <div className={`font-sora font-extrabold text-2xl ${getScoreColor(analysis.score)}`}>
                {analysis.score}
              </div>
              <div className={`text-[10px] font-bold ${getScoreColor(analysis.score)}`}>
                {analysis.grade}
              </div>
            </div>
          </div>
          <div className="text-left">
            <h3 className="font-sora font-bold text-navy dark:text-white text-[15px] flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-brand" />
              SEO Score & Analysis
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-0.5">
              {criticalIssues.length > 0 && (
                <span className="text-red-500 font-semibold">{criticalIssues.length} critical issues</span>
              )}
              {criticalIssues.length > 0 && warningIssues.length > 0 && <span> · </span>}
              {warningIssues.length > 0 && (
                <span className="text-yellow-600 dark:text-yellow-400 font-semibold">{warningIssues.length} warnings</span>
              )}
              {criticalIssues.length === 0 && warningIssues.length === 0 && (
                <span className="text-green-600 dark:text-green-400 font-semibold">Looking good!</span>
              )}
            </p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>

      {expanded && (
        <div className="p-6 space-y-6">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'issues', label: `Issues (${analysis.issues.length})` },
              { id: 'recommendations', label: `Tips (${analysis.recommendations.length})` },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-jakarta font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-gray-700 text-navy dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-navy dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Title', score: analysis.breakdown.title.score, max: analysis.breakdown.title.max, icon: FileText },
                  { label: 'Description', score: analysis.breakdown.description.score, max: analysis.breakdown.description.max, icon: BookOpen },
                  { label: 'Content', score: analysis.breakdown.content.score, max: analysis.breakdown.content.max, icon: FileText },
                  { label: 'Keywords', score: analysis.breakdown.keywords.score, max: analysis.breakdown.keywords.max, icon: Target },
                  { label: 'Images', score: analysis.breakdown.images.score, max: analysis.breakdown.images.max, icon: Image },
                  { label: 'Readability', score: analysis.breakdown.readability.score, max: analysis.breakdown.readability.max, icon: BookOpen },
                ].map(item => {
                  const percentage = (item.score / item.max) * 100;
                  return (
                    <div key={item.label} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <item.icon className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 font-jakarta">{item.label}</span>
                        </div>
                        <span className="text-xs font-bold text-navy dark:text-white font-sora">
                          {item.score}/{item.max}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            percentage >= 80 ? 'bg-green-500' :
                            percentage >= 60 ? 'bg-blue-500' :
                            percentage >= 40 ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick Stats */}
              <div className="bg-gradient-to-r from-brand/5 to-purple-500/5 rounded-xl p-4">
                <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 font-jakarta">
                  Performance Indicators
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <div className={`text-2xl font-bold font-sora ${getScoreColor(analysis.score)}`}>
                      {analysis.grade}
                    </div>
                    <div className="text-[10px] text-gray-500 font-jakarta mt-0.5">Overall Grade</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold font-sora text-red-600 dark:text-red-400">
                      {criticalIssues.length}
                    </div>
                    <div className="text-[10px] text-gray-500 font-jakarta mt-0.5">Critical Issues</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold font-sora text-blue-600 dark:text-blue-400">
                      {analysis.recommendations.length}
                    </div>
                    <div className="text-[10px] text-gray-500 font-jakarta mt-0.5">Improvements</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Issues Tab */}
          {activeTab === 'issues' && (
            <div className="space-y-3">
              {analysis.issues.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 font-jakarta">
                    No issues found! Your SEO is looking great.
                  </p>
                </div>
              ) : (
                analysis.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border-l-4 ${
                      issue.severity === 'critical'
                        ? 'bg-red-50 dark:bg-red-900/10 border-red-500'
                        : issue.severity === 'warning'
                        ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-500'
                        : 'bg-blue-50 dark:bg-blue-900/10 border-blue-500'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {getSeverityIcon(issue.severity)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase font-jakarta">
                            {issue.category}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            issue.severity === 'critical'
                              ? 'bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-300'
                              : issue.severity === 'warning'
                              ? 'bg-yellow-200 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-300'
                              : 'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300'
                          }`}>
                            {issue.severity}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-navy dark:text-white font-jakarta mb-1">
                          {issue.message}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 font-jakarta">
                          <span className="font-semibold">Fix:</span> {issue.fix}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Recommendations Tab */}
          {activeTab === 'recommendations' && (
            <div className="space-y-3">
              {analysis.recommendations.length === 0 ? (
                <div className="text-center py-8">
                  <Zap className="w-12 h-12 text-brand mx-auto mb-3" />
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 font-jakarta">
                    You're doing everything right! No recommendations at this time.
                  </p>
                </div>
              ) : (
                analysis.recommendations.map((rec, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-start gap-3">
                      <Zap className="w-4 h-4 text-brand mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold text-navy dark:text-white font-jakarta">
                            {rec.title}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${getPriorityBadge(rec.priority)}`}>
                            {rec.priority}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 font-jakarta mb-2">
                          {rec.description}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-500 font-jakarta italic">
                          💡 {rec.impact}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

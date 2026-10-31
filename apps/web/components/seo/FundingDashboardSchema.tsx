import { jsonLd } from "@/lib/json-ld";
/**
 * Funding Dashboard Schema Component
 * Unified @graph with DataFeed + FAQPage + BreadcrumbList
 * Optimized for Google's financial data understanding
 */

interface FundingDashboardSchemaProps {
  rounds: Array<{
    id: string;
    startupName: string;
    startupSlug: string;
    roundType: string;
    amountUsd: number;
    amountInr: number;
    announcedAt: string;
    leadInvestors?: string[];
    headquartersCity?: string;
  }>;
  stats: {
    totalRaisedUsd: number;
    totalDeals: number;
    avgDealSizeUsd: number;
    topInvestor: string;
    lastUpdated: string; // Last funding round date from DB
  };
}

export function FundingDashboardSchema({ rounds, stats }: FundingDashboardSchemaProps) {
  const pageUrl = 'https://udyaibase.com/funding';
  const webpageId = `${pageUrl}#webpage`;
  const datafeedId = `${pageUrl}#datafeed`;
  const breadcrumbId = `${pageUrl}#breadcrumb`;
  const faqId = `${pageUrl}#faq`;
  
  // Use last funding round date (from DB), not new Date()
  const dateModified = stats.lastUpdated;
  
  // Top 3 startups by funding amount
  const topStartups = [...rounds]
    .sort((a, b) => b.amountUsd - a.amountUsd)
    .slice(0, 3);
  
  // Top investors by deal count
  const investorCounts = new Map<string, number>();
  rounds.forEach(r => {
    r.leadInvestors?.forEach(inv => {
      investorCounts.set(inv, (investorCounts.get(inv) || 0) + 1);
    });
  });
  const topInvestors = Array.from(investorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);
  
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      // WebPage - base entity
      {
        "@type": "WebPage",
        "@id": webpageId,
        "url": pageUrl,
        "name": "AI Startup Funding Tracker - Live Dashboard",
        "description": "Real-time tracker of AI startup funding rounds in India with filterable data",
        "isPartOf": {
          "@id": "https://udyaibase.com/#website"
        },
        "about": {
          "@id": datafeedId
        },
        "dateModified": dateModified,
        "breadcrumb": {
          "@id": breadcrumbId
        },
        "mainEntity": {
          "@id": datafeedId
        },
        "inLanguage": "en-IN"
      },
      
      // DataFeed - the main entity
      {
        "@type": "DataFeed",
        "@id": datafeedId,
        "name": "AI Startup Funding Rounds Tracker",
        "description": "Continuously updated database of AI startup funding rounds in India",
        "url": pageUrl,
        "dateModified": dateModified,
        "dataFeedElement": rounds.slice(0, 20).map(round => ({
          "@type": "MonetaryGrant",
          "name": `${round.startupName} - ${round.roundType}`,
          "amount": {
            "@type": "MonetaryAmount",
            "currency": "USD",
            "value": round.amountUsd
          },
          "funder": round.leadInvestors?.[0] ? {
            "@type": "Organization",
            "name": round.leadInvestors[0]
          } : undefined,
          "recipient": {
            "@type": "Organization",
            "name": round.startupName,
            "url": `https://udyaibase.com/startups/${round.startupSlug}`
          },
          "startDate": round.announcedAt // Correct property for MonetaryGrant
        }))
      },
      
      // BreadcrumbList
      {
        "@type": "BreadcrumbList",
        "@id": breadcrumbId,
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Home",
            "item": "https://udyaibase.com"
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Funding Tracker",
            "item": pageUrl
          }
        ]
      },
      
      // FAQPage - with real data, no placeholders
      {
        "@type": "FAQPage",
        "@id": faqId,
        "mainEntity": [
          {
            "@type": "Question",
            "name": "How much funding have AI startups raised in India?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": `AI startups in India have raised over $${(stats.totalRaisedUsd / 1000000).toFixed(0)} million (₹${(stats.totalRaisedUsd * 83 / 10000000).toFixed(0)} Crore) across ${stats.totalDeals} funding rounds. The data is updated weekly with the latest deals as of ${new Date(stats.lastUpdated).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.`
            }
          },
          {
            "@type": "Question",
            "name": "Which AI startups raised the most funding in India?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": `The top funded AI startups include ${topStartups.map((s, i) => 
                `${i + 1}. ${s.startupName} ($${(s.amountUsd / 1000000).toFixed(1)}M in ${s.roundType})`
              ).join(', ')}. View the complete funding tracker for all ${stats.totalDeals} deals.`
            }
          },
          {
            "@type": "Question",
            "name": "Who are the top investors in AI startups in India?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": topInvestors.length > 0 
                ? `Leading investors in AI startups include ${topInvestors.join(', ')}. Our tracker shows all investor participation across ${stats.totalDeals} funding rounds with detailed lead investor information.`
                : `Our tracker shows investor participation across ${stats.totalDeals} funding rounds with detailed lead investor information for AI startups in India.`
            }
          },
          {
            "@type": "Question",
            "name": "What is the average AI startup funding round size in India?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": `The average funding round for AI startups in India is $${(stats.avgDealSizeUsd / 1000000).toFixed(1)} million (₹${(stats.avgDealSizeUsd * 83 / 10000000).toFixed(1)} Crore), with seed rounds typically ranging from $500K-$2M and Series A rounds from $5M-$15M.`
            }
          },
          {
            "@type": "Question",
            "name": "How often is the AI startup funding data updated?",
            "acceptedAnswer": {
              "@type": "Answer",
              "text": `The funding tracker is updated weekly with new funding announcements. The most recent update was ${new Date(stats.lastUpdated).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. We track all publicly announced funding rounds for AI startups in India.`
            }
          }
        ]
      }
    ]
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd(schema) }}
    />
  );
}

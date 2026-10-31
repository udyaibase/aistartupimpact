import { jsonLd } from "@/lib/json-ld";
/**
 * Startup JSON-LD Schema Component
 * Generates structured data with @graph containing WebPage, Organization, and BreadcrumbList
 * Issue #1 Fixed: Single @graph with entity linking
 * Issue #6 Fixed: WebPage schema added for entity relationship
 */

interface StartupSchemaProps {
  startup: {
    name: string;
    slug: string;
    description: string;
    logoUrl?: string;
    websiteUrl?: string;
    foundedYear?: number;
    headquartersCity?: string;
    founders?: string[];
    employeeCount?: number;
    linkedinUrl?: string;
    twitterUrl?: string;
    stage?: string;
    tagline?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

export function StartupSchema({ startup }: StartupSchemaProps) {
  const pageUrl = `https://udyaibase.com/startups/${startup.slug}`;
  const orgId = `${pageUrl}#organization`;
  
  // Use actual database timestamps for SEO integrity
  // Fallback to current date only if timestamps are missing (should never happen in production)
  const datePublished = startup.createdAt || new Date().toISOString();
  const dateModified = startup.updatedAt || startup.createdAt || new Date().toISOString();
  
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      // WebPage - connects page to organization
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        "url": pageUrl,
        "name": `${startup.name} - ${startup.tagline || startup.description?.slice(0, 60) || 'AI Startup'}`,
        "isPartOf": {
          "@id": "https://udyaibase.com/#website"
        },
        "about": {
          "@id": orgId
        },
        "primaryImageOfPage": startup.logoUrl ? {
          "@id": `${pageUrl}#primaryimage`
        } : undefined,
        "datePublished": datePublished,
        "dateModified": dateModified,
        "breadcrumb": {
          "@id": `${pageUrl}#breadcrumb`
        },
        "inLanguage": "en-IN"
      },
      // Organization - the main entity
      {
        "@type": "Organization",
        "@id": orgId,
        "name": startup.name,
        "description": startup.description,
        "url": startup.websiteUrl,
        "logo": startup.logoUrl ? {
          "@type": "ImageObject",
          "@id": `${pageUrl}#primaryimage`,
          "url": startup.logoUrl,
          "width": 200,
          "height": 200,
          "caption": `${startup.name} logo`
        } : undefined,
        "foundingDate": startup.foundedYear?.toString(),
        "foundingLocation": startup.headquartersCity ? {
          "@type": "Place",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": startup.headquartersCity,
            "addressRegion": "India",
            "addressCountry": "IN"
          }
        } : undefined,
        "founder": startup.founders?.map(name => ({
          "@type": "Person",
          "name": name
        })),
        "numberOfEmployees": startup.employeeCount ? {
          "@type": "QuantitativeValue",
          "value": startup.employeeCount
        } : undefined,
        "sameAs": [
          startup.linkedinUrl,
          startup.twitterUrl,
          startup.websiteUrl
        ].filter(Boolean),
        "knowsAbout": [
          "Artificial Intelligence",
          "Machine Learning",
          "AI Technology",
          "India AI Ecosystem"
        ],
        "areaServed": {
          "@type": "Country",
          "name": "India"
        }
      },
      // BreadcrumbList - navigation hierarchy
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
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
            "name": "Startups",
            "item": "https://udyaibase.com/startups"
          },
          {
            "@type": "ListItem",
            "position": 3,
            "name": startup.name,
            "item": pageUrl
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

import { jsonLd } from "@/lib/json-ld";
/**
 * IndiaAI Government Scheme Schema Component
 * Unified @graph with GovernmentService + FAQPage + BreadcrumbList
 * Optimized for Google's entity graph and government content authority
 */

interface IndiaAISchemeSchemaProps {
  scheme: {
    name: string;
    slug: string;
    description: string;
    budgetAllocated: number;
    budgetDisbursed: number;
    eligibility: string[];
    applicationUrl?: string;
    provider: string;
    providerUrl?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  faqs: Array<{
    question: string;
    answer: string;
  }>;
}

export function IndiaAISchemeSchema({ scheme, faqs }: IndiaAISchemeSchemaProps) {
  const pageUrl = `https://udyaibase.com/india-ai/schemes/${scheme.slug}`;
  const serviceId = `${pageUrl}#service`;
  const webpageId = `${pageUrl}#webpage`;
  const breadcrumbId = `${pageUrl}#breadcrumb`;
  const faqId = `${pageUrl}#faq`;
  
  // Use actual database timestamps or fallback to current date
  const datePublished = scheme.createdAt || new Date().toISOString();
  const dateModified = scheme.updatedAt || scheme.createdAt || new Date().toISOString();
  
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      // WebPage - base entity
      {
        "@type": "WebPage",
        "@id": webpageId,
        "url": pageUrl,
        "name": `${scheme.name} - Government AI Funding Scheme India`,
        "description": scheme.description,
        "isPartOf": {
          "@id": "https://udyaibase.com/#website"
        },
        "about": {
          "@id": serviceId
        },
        "datePublished": datePublished,
        "dateModified": dateModified,
        "breadcrumb": {
          "@id": breadcrumbId
        },
        "mainEntity": {
          "@id": serviceId
        },
        "inLanguage": "en-IN"
      },
      
      // GovernmentService - the main entity
      {
        "@type": "GovernmentService",
        "@id": serviceId,
        "name": scheme.name,
        "description": scheme.description,
        "serviceType": "Government Funding Program",
        "provider": {
          "@type": "GovernmentOrganization",
          "name": scheme.provider,
          "url": scheme.providerUrl || "https://www.meity.gov.in/"
        },
        "areaServed": {
          "@type": "Country",
          "name": "India",
          "sameAs": "https://www.wikidata.org/wiki/Q668"
        },
        "audience": {
          "@type": "Audience",
          "audienceType": "AI Startups and Researchers",
          "geographicArea": {
            "@type": "Country",
            "name": "India"
          }
        },
        "availableChannel": scheme.applicationUrl ? {
          "@type": "ServiceChannel",
          "serviceUrl": scheme.applicationUrl,
          "serviceType": "Online Application"
        } : undefined,
        "termsOfService": scheme.applicationUrl,
        "category": "Artificial Intelligence Funding",
        "offers": {
          "@type": "Offer",
          "description": `Total budget: ₹${(scheme.budgetAllocated / 10000000).toFixed(0)} Crore`,
          "priceCurrency": "INR",
          "eligibleRegion": {
            "@type": "Country",
            "name": "India"
          }
        }
      },
      
      // BreadcrumbList - navigation hierarchy
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
            "name": "India AI Ecosystem",
            "item": "https://udyaibase.com/india-ai"
          },
          {
            "@type": "ListItem",
            "position": 3,
            "name": "Government Schemes",
            "item": "https://udyaibase.com/india-ai/schemes"
          },
          {
            "@type": "ListItem",
            "position": 4,
            "name": scheme.name,
            "item": pageUrl
          }
        ]
      },
      
      // FAQPage - Q&A for featured snippets
      {
        "@type": "FAQPage",
        "@id": faqId,
        "mainEntity": faqs.map((faq) => ({
          "@type": "Question",
          "name": faq.question,
          "acceptedAnswer": {
            "@type": "Answer",
            "text": faq.answer
          }
        }))
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

// Pre-written FAQs for the three main schemes

export const INDIAAI_MISSION_FAQS = [
  {
    question: "What is the IndiaAI Mission?",
    answer: "The IndiaAI Mission is a ₹10,372 Crore government initiative launched by the Ministry of Electronics and IT (MeitY) to accelerate India's AI ecosystem. It focuses on compute infrastructure, innovation centers, datasets, application development, future skills, safe & trusted AI, and startup financing."
  },
  {
    question: "Who is eligible for IndiaAI Mission funding?",
    answer: "Indian AI startups and research institutions incorporated in India are eligible. Eligibility criteria include: (1) Company registered in India, (2) Working on AI/ML technology or applications, (3) Alignment with national AI priorities, (4) Team with relevant technical expertise, (5) Clear use case for compute resources or funding. Both early-stage startups and established companies can apply for different pillars of the mission."
  },
  {
    question: "How do I apply for IndiaAI Mission benefits?",
    answer: "Applications are submitted through the National AI Portal (indiaai.gov.in). The process involves: (1) Register on the IndiaAI portal, (2) Select the relevant pillar (compute, innovation, datasets, etc.), (3) Submit detailed project proposal, (4) Provide company and founder information, (5) Demonstrate AI capability and impact potential. Each pillar has specific application windows and requirements announced on the portal."
  },
  {
    question: "What compute resources are available under IndiaAI Mission?",
    answer: "The IndiaAI Mission provides access to 10,000+ GPUs through the IndiaAI Compute Infrastructure. Startups and researchers can access high-performance computing resources including NVIDIA H100, A100, and other AI-optimized hardware. Resources are allocated based on project requirements, with subsidized rates for eligible Indian entities."
  },
  {
    question: "How much funding can startups get from IndiaAI Mission?",
    answer: "Funding varies by pillar. The Startup Financing pillar allocates ₹2,000+ Crore for AI startups through a fund-of-funds model. Individual startup funding ranges from ₹25 Lakh to ₹10 Crore depending on stage, use case, and impact potential. Deep-tech AI startups working on foundational models or critical applications may receive higher allocations."
  }
];

export const STARTUP_INDIA_SEED_FUND_FAQS = [
  {
    question: "What is the Startup India Seed Fund Scheme (SISFS)?",
    answer: "The Startup India Seed Fund Scheme (SISFS) is a ₹945 Crore government initiative to provide financial assistance to startups for proof of concept, prototype development, product trials, market entry, and commercialization. It is managed by eligible incubators across India who disburse funds to startups in their portfolio."
  },
  {
    question: "Who is eligible for Startup India Seed Fund?",
    answer: "Eligibility criteria: (1) Startup recognized by DPIIT (Department for Promotion of Industry and Internal Trade), (2) Incorporated less than 2 years ago, (3) Working on innovation, development, or commercialization of new products or services, (4) Not received more than ₹10 Lakh from any government scheme, (5) Incubated or selected by an eligible incubator. AI startups meeting these criteria can apply through their incubator."
  },
  {
    question: "How much funding can I get from SISFS?",
    answer: "Startups can receive up to ₹20 Lakh as grant for proof of concept and prototype development, and up to ₹50 Lakh as debt/convertible debentures for market entry and commercialization. Total maximum support is ₹20 Lakh grant + ₹50 Lakh debt = ₹70 Lakh per startup. Funding is milestone-based and disbursed in tranches."
  },
  {
    question: "How do I apply for Startup India Seed Fund?",
    answer: "Applications are submitted through eligible incubators, not directly to the government. Process: (1) Get incubated at a SISFS-empaneled incubator, (2) Prepare detailed project proposal with milestones, (3) Incubator evaluates and nominates your startup, (4) Submit application through incubator's portal, (5) Expert committee reviews and approves funding. Check the Startup India portal for the list of eligible incubators."
  },
  {
    question: "Can AI startups apply for Startup India Seed Fund?",
    answer: "Yes, AI startups are highly encouraged to apply. The scheme prioritizes technology-driven startups working on innovative solutions. AI startups working on applications in healthcare, agriculture, fintech, education, or other sectors are eligible. Ensure your startup is DPIIT-recognized and incubated at an eligible incubator before applying."
  }
];

export const MEITY_GRANTS_FAQS = [
  {
    question: "What grants does MeitY offer for AI startups?",
    answer: "The Ministry of Electronics and IT (MeitY) offers multiple grant schemes for AI startups: (1) Startup Hub grants (up to ₹50 Lakh), (2) TIDE 2.0 grants for product development, (3) Research & Development grants through CDAC and IITs, (4) Innovation challenges with prize money, (5) IndiaAI Mission grants for specific pillars. Each scheme has different eligibility criteria and funding amounts."
  },
  {
    question: "Who is eligible for MeitY AI grants?",
    answer: "Eligibility varies by scheme but generally includes: (1) Indian startups registered in India, (2) Working on electronics, IT, or AI technology, (3) DPIIT-recognized startup (for some schemes), (4) Clear innovation or R&D component, (5) Alignment with Digital India or IndiaAI priorities. Some schemes are open to research institutions and academic collaborations as well."
  },
  {
    question: "How do I apply for MeitY grants?",
    answer: "Application process: (1) Visit the MeitY Startup Hub portal (meity.gov.in/startups), (2) Check active grant schemes and eligibility, (3) Register your startup on the portal, (4) Submit detailed project proposal with budget, (5) Provide technical and financial documentation, (6) Expert committee evaluates applications. Applications are typically evaluated quarterly with 2-3 month decision timelines."
  },
  {
    question: "What is the typical grant amount from MeitY?",
    answer: "Grant amounts vary by scheme: Startup Hub grants range from ₹10 Lakh to ₹50 Lakh for product development and market entry. TIDE 2.0 grants can go up to ₹1 Crore for deep-tech products. Research grants through CDAC/IITs range from ₹25 Lakh to ₹2 Crore for multi-year projects. Innovation challenge prizes range from ₹5 Lakh to ₹50 Lakh depending on the challenge."
  },
  {
    question: "Can I apply for multiple MeitY schemes simultaneously?",
    answer: "Yes, startups can apply for multiple MeitY schemes as long as they meet individual eligibility criteria and the projects are distinct. However, you cannot receive funding for the same project/milestone from multiple government schemes. Clearly specify any existing government funding in your applications. MeitY encourages startups to leverage different schemes for different stages of growth."
  }
];

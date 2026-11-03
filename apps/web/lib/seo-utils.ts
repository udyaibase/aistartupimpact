/**
 * SEO Utilities for Udyaibase
 * Helper functions for schema generation, FAQ creation, and SEO optimization
 */

export interface StartupData {
  name: string;
  slug: string;
  description: string;
  logoUrl?: string;
  websiteUrl?: string;
  foundedYear?: number;
  headquartersCity?: string;
  founders?: string[];
  foundersData?: Array<{
    name: string;
    role?: string;
    bio?: string;
    avatar?: string;
    linkedin?: string;
    twitter?: string;
    website?: string;
  }>;
  employeeCount?: number;
  linkedinUrl?: string;
  twitterUrl?: string;
  stage?: string;
  tagline?: string;
  category?: string;
  fundingRounds?: Array<{
    roundType: string;
    amountUsd?: number;
    announcedAt?: string;
    leadInvestors?: string[];
  }>;
}

export interface ToolData {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  websiteUrl: string;
  logoUrl?: string;
  pricingModel: string;
  startingPrice?: number;
  avgRating?: number | null;
  reviewCount?: number;
  category?: string;
  categoryName?: string;
  hasApi?: boolean;
  hasMobileApp?: boolean;
  headquartersCountry?: string;
  headquartersCity?: string;
  founderNames?: string[];
  useCases?: Array<{ id: string; text: string }>;
}

export interface FAQ {
  question: string;
  answer: string;
}

/**
 * Format USD cents to human-readable string
 * @param cents - Amount in cents
 * @returns Formatted string like "$41M" or null if 0
 */
export function formatUsd(cents: number | null): string | null {
  if (!cents || Number(cents) === 0) return null;
  const dollars = Number(cents) / 100;
  if (dollars >= 1e9) return `$${(dollars / 1e9).toFixed(1)}B`;
  if (dollars >= 1e6) return `$${(dollars / 1e6).toFixed(0)}M`;
  return `$${(dollars / 1e3).toFixed(0)}K`;
}

/**
 * Get contextual description for Indian cities
 * @param city - City name
 * @returns Contextual description
 */
export function getCityContext(city: string): string {
  const contexts: Record<string, string> = {
    'Bengaluru': 'known as India\'s Silicon Valley and a major hub for AI startups',
    'Bangalore': 'known as India\'s Silicon Valley and a major hub for AI startups',
    'Mumbai': 'India\'s financial capital with a growing AI ecosystem',
    'Delhi': 'the national capital with strong government and enterprise AI adoption',
    'New Delhi': 'the national capital with strong government and enterprise AI adoption',
    'Hyderabad': 'a major tech hub with significant AI research and development',
    'Pune': 'an emerging AI and tech center with strong academic institutions',
    'Chennai': 'a key technology hub with expertise in AI and automotive tech',
    'Gurugram': 'a major corporate hub with thriving AI and enterprise tech sector',
    'Gurgaon': 'a major corporate hub with thriving AI and enterprise tech sector',
    'Noida': 'a growing tech hub in the National Capital Region',
    'Kolkata': 'an emerging tech center with strong academic and research institutions',
    'Ahmedabad': 'a growing startup ecosystem with focus on AI innovation',
  };
  return contexts[city] || 'a growing hub for AI innovation in India';
}

/**
 * Generate startup-specific FAQs with real data injection
 * @param startup - Startup data
 * @param totalRaised - Total funding raised in cents
 * @returns Array of FAQ objects
 */
export function generateStartupFAQs(startup: StartupData, totalRaised: number): FAQ[] {
  const faqs: FAQ[] = [];

  // Q1: What does X do? (use actual description)
  if (startup.description) {
    faqs.push({
      question: `What does ${startup.name} do?`,
      answer: startup.description.slice(0, 500) // Limit to 500 chars for FAQ
    });
  }

  // Q2: IndiaAI eligibility (inject specific data)
  const eligibilityAnswer = `${startup.name}${startup.foundedYear ? `, founded in ${startup.foundedYear}` : ''}${startup.headquartersCity ? ` and based in ${startup.headquartersCity}` : ''}, is an AI startup${startup.stage ? ` in the ${startup.stage.replace(/_/g, ' ').toLowerCase()} stage` : ''}${startup.tagline ? ` working on ${startup.tagline.toLowerCase()}` : ''}. ` +
    `Indian AI startups${startup.category ? ` with a focus on ${startup.category.toLowerCase()}` : ''} may be eligible for government funding through the India AI Mission, National AI Portal, and state-level schemes. ` +
    `Eligibility criteria typically include: (1) Incorporation in India, (2) AI/ML technology focus, (3) Alignment with national AI priorities, (4) Team with relevant expertise. ` +
    `${startup.name}'s work${startup.tagline ? ` in ${startup.tagline.toLowerCase()}` : ''}${startup.headquartersCity ? ` and presence in ${startup.headquartersCity}` : ''} positions it well for consideration. ` +
    `Visit the National AI Portal (indiaai.gov.in) or contact your local startup cell for specific eligibility verification.`;
  
  faqs.push({
    question: `Is ${startup.name} eligible for India AI Mission funding?`,
    answer: eligibilityAnswer
  });

  // Q3: Location (specific city data)
  if (startup.headquartersCity) {
    const cityContext = getCityContext(startup.headquartersCity);
    faqs.push({
      question: `Where is ${startup.name} located?`,
      answer: `${startup.name} is headquartered in ${startup.headquartersCity}, India${startup.foundedYear ? `, where it was founded in ${startup.foundedYear}` : ''}. ${startup.headquartersCity} is ${cityContext}.`
    });
  }

  // Q4: Founding (specific year + founders)
  if (startup.foundedYear) {
    const founderText = startup.founders && startup.founders.length > 0 
      ? ` by ${startup.founders.join(', ')}`
      : '';
    const growthText = startup.employeeCount 
      ? ` Since then, it has grown to ${startup.employeeCount}+ employees`
      : '';
    faqs.push({
      question: `When was ${startup.name} founded?`,
      answer: `${startup.name} was founded in ${startup.foundedYear}${founderText}.${growthText}${startup.tagline ? ` and has been working on ${startup.tagline.toLowerCase()}` : ''}.`
    });
  }

  // Q5: Funding (specific amounts + rounds)
  if (totalRaised > 0 && startup.fundingRounds && startup.fundingRounds.length > 0) {
    const latestRound = startup.fundingRounds[0];
    const roundDetails = latestRound 
      ? `, with the most recent ${latestRound.roundType}${latestRound.leadInvestors && latestRound.leadInvestors.length > 0 ? ` round led by ${latestRound.leadInvestors[0]}` : ' round'}`
      : '';
    
    faqs.push({
      question: `How much funding has ${startup.name} raised?`,
      answer: `${startup.name} has raised a total of ${formatUsd(totalRaised)} across ${startup.fundingRounds.length} funding round${startup.fundingRounds.length > 1 ? 's' : ''}${roundDetails}.${startup.tagline ? ` This funding supports their work in ${startup.tagline.toLowerCase()}.` : ''}`
    });
  }

  // Q6: Founders (specific names + roles)
  if (startup.foundersData && startup.foundersData.length > 0) {
    const founderDetails = startup.foundersData
      .map((f) => `${f.name}${f.role ? ` (${f.role})` : ''}`)
      .join(', ');
    
    faqs.push({
      question: `Who founded ${startup.name}?`,
      answer: `${startup.name} was founded by ${founderDetails}. The founding team brings expertise in ${startup.category || 'AI technology'}${startup.employeeCount ? ` and has built ${startup.name} into a team of ${startup.employeeCount}+ people` : ''}.`
    });
  } else if (startup.founders && startup.founders.length > 0) {
    faqs.push({
      question: `Who founded ${startup.name}?`,
      answer: `${startup.name} was founded by ${startup.founders.join(', ')}.${startup.employeeCount ? ` The company has grown to ${startup.employeeCount}+ employees.` : ''}`
    });
  }

  // Q7: Team size (specific number + growth)
  if (startup.employeeCount) {
    const growthContext = startup.foundedYear 
      ? ` Since its founding in ${startup.foundedYear}, the company has grown significantly`
      : '';
    
    faqs.push({
      question: `How many employees does ${startup.name} have?`,
      answer: `${startup.name} currently has ${startup.employeeCount}+ employees.${growthContext}${startup.tagline ? `, reflecting the demand for their ${startup.tagline.toLowerCase()}` : ''}.`
    });
  }

  // Q8: Hiring (specific to stage + location)
  const hiringContext = startup.stage === 'SEED' || startup.stage === 'SERIES_A'
    ? `As a ${startup.stage.replace(/_/g, ' ').toLowerCase()} stage company, ${startup.name} is likely actively hiring`
    : `${startup.name} may have open positions`;
  
  faqs.push({
    question: `Is ${startup.name} hiring?`,
    answer: `${hiringContext} for roles in ${startup.category || 'AI/ML'}, engineering, and product. Check their careers page${startup.websiteUrl ? ` at ${startup.websiteUrl}` : ''} or LinkedIn for current openings${startup.headquartersCity ? ` in ${startup.headquartersCity}` : ''}.`
  });

  return faqs;
}

/**
 * Generate tool-specific FAQs with real data injection
 * @param tool - Tool data
 * @returns Array of FAQ objects
 */
export function generateToolFAQs(tool: ToolData): FAQ[] {
  const faqs: FAQ[] = [];

  // Q1: What is X?
  if (tool.description) {
    faqs.push({
      question: `What is ${tool.name}?`,
      answer: tool.description.slice(0, 500)
    });
  }

  // Q2: Pricing
  const pricingLabels: Record<string, string> = {
    FREE: 'completely free to use',
    FREEMIUM: 'free to start with premium features available',
    PAID: 'a paid tool',
    OPEN_SOURCE: 'open source and free to use',
    ENTERPRISE: 'available for enterprise customers',
    SUBSCRIPTION: 'available on a subscription basis',
  };
  
  const pricingText = pricingLabels[tool.pricingModel] || 'available';
  const priceDetail = tool.startingPrice 
    ? ` with plans starting at $${(tool.startingPrice / 100).toFixed(tool.startingPrice % 100 === 0 ? 0 : 2)}/month`
    : '';
  
  faqs.push({
    question: `How much does ${tool.name} cost?`,
    answer: `${tool.name} is ${pricingText}${priceDetail}. Visit their pricing page at ${tool.websiteUrl} for detailed pricing information and plan comparisons.`
  });

  // Q3: Use cases (if available)
  if (tool.useCases && tool.useCases.length > 0) {
    const useCaseList = tool.useCases
      .slice(0, 3)
      .map(uc => uc.text.replace(/^[•\-\*]\s*/, ''))
      .join(', ');
    
    faqs.push({
      question: `What can I use ${tool.name} for?`,
      answer: `${tool.name} can be used for ${useCaseList}${tool.useCases.length > 3 ? ', and more' : ''}. It's designed to help ${tool.category || 'AI'} professionals and businesses streamline their workflows.`
    });
  }

  // Q4: API availability
  if (tool.hasApi) {
    faqs.push({
      question: `Does ${tool.name} have an API?`,
      answer: `Yes, ${tool.name} provides an API for developers to integrate its capabilities into their applications. Check their documentation at ${tool.websiteUrl} for API details, authentication, and usage limits.`
    });
  }

  // Q5: Mobile app
  if (tool.hasMobileApp) {
    faqs.push({
      question: `Is ${tool.name} available on mobile?`,
      answer: `Yes, ${tool.name} has a mobile app available for iOS and Android devices. You can access ${tool.name} on the go and sync your work across devices.`
    });
  }

  // Q6: Reviews and ratings
  if (tool.avgRating && tool.avgRating > 0 && tool.reviewCount && tool.reviewCount > 0) {
    faqs.push({
      question: `What do users think of ${tool.name}?`,
      answer: `${tool.name} has an average rating of ${tool.avgRating} out of 5 stars based on ${tool.reviewCount} user review${tool.reviewCount > 1 ? 's' : ''}. Users appreciate its ${tool.tagline.toLowerCase()}.`
    });
  }

  // Q7: Who makes it
  if (tool.founderNames && tool.founderNames.length > 0) {
    faqs.push({
      question: `Who created ${tool.name}?`,
      answer: `${tool.name} was created by ${tool.founderNames.join(', ')}${tool.headquartersCity || tool.headquartersCountry ? ` and is based in ${[tool.headquartersCity, tool.headquartersCountry].filter(Boolean).join(', ')}` : ''}. The team focuses on ${tool.category || 'AI technology'} innovation.`
    });
  }

  // Q8: Getting started
  faqs.push({
    question: `How do I get started with ${tool.name}?`,
    answer: `To get started with ${tool.name}, visit ${tool.websiteUrl} and sign up for an account. ${tool.pricingModel === 'FREE' || tool.pricingModel === 'FREEMIUM' ? 'You can start using it immediately with the free plan.' : 'Choose a plan that fits your needs and start exploring the features.'} Check their documentation for tutorials and guides.`
  });

  return faqs;
}

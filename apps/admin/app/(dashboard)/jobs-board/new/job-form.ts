

export function renderDescriptionPreview(text: string): string {
  if (!text) return '';
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('### ')) return `<h3 class="text-base font-bold mt-4 mb-1 text-navy dark:text-white">${trimmed.slice(4)}</h3>`;
      if (trimmed.startsWith('## ')) return `<h2 class="text-lg font-bold mt-4 mb-1 text-navy dark:text-white">${trimmed.slice(3)}</h2>`;
      if (trimmed.startsWith('# ')) return `<h1 class="text-xl font-bold mt-4 mb-1 text-navy dark:text-white">${trimmed.slice(2)}</h1>`;
      if (trimmed.startsWith('• ') || trimmed.startsWith('- ')) return `<li class="ml-4 list-disc text-sm text-gray-700 dark:text-gray-300">${trimmed.slice(2)}</li>`;
      if (trimmed === '') return '<br/>';
      return `<p class="text-sm text-gray-700 dark:text-gray-300">${trimmed}</p>`;
    })
    .join('\n');
}

export const DEPARTMENTS = [
  'Engineering',
  'Product',
  'Design',
  'Data Science',
  'Machine Learning',
  'AI Research',
  'Platform',
  'Infrastructure',
  'DevOps',
  'QA & Testing',
  'Security',
  'Sales',
  'Marketing',
  'Growth',
  'Business Development',
  'Customer Success',
  'Operations',
  'Human Resources',
  'Finance',
  'Legal',
  'Content',
  'Analytics',
  'Support',
];

export const CUSTOM_DEPTS_KEY = 'udyaibase_custom_departments';

export function getCustomDepartments(): string[] {
  try {
    const stored = localStorage.getItem(CUSTOM_DEPTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

export function saveCustomDepartment(dept: string) {
  try {
    const existing = getCustomDepartments();
    if (!existing.includes(dept)) {
      existing.push(dept);
      existing.sort();
      localStorage.setItem(CUSTOM_DEPTS_KEY, JSON.stringify(existing));
    }
  } catch {}
}

export const JOB_CATEGORIES = [
  { value: 'AI_ENGINEER', label: 'AI Engineer' },
  { value: 'ML_ENGINEER', label: 'ML Engineer' },
  { value: 'LLM_ENGINEER', label: 'LLM Engineer' },
  { value: 'AI_RESEARCH_SCIENTIST', label: 'AI Research Scientist' },
  { value: 'DATA_SCIENTIST', label: 'Data Scientist' },
  { value: 'DATA_ENGINEER', label: 'Data Engineer' },
  { value: 'PROMPT_ENGINEER', label: 'Prompt Engineer' },
  { value: 'AI_PRODUCT_MANAGER', label: 'AI Product Manager' },
  { value: 'AI_DESIGNER', label: 'AI Designer' },
  { value: 'AI_SALES', label: 'AI Sales' },
  { value: 'AI_MARKETING', label: 'AI Marketing' },
  { value: 'AI_DEVREL', label: 'AI DevRel' },
  { value: 'AI_SOLUTIONS_ARCHITECT', label: 'AI Solutions Architect' },
  { value: 'AI_ETHICS', label: 'AI Ethics' },
  { value: 'ROBOTICS_ENGINEER', label: 'Robotics Engineer' },
  { value: 'COMPUTER_VISION', label: 'Computer Vision' },
  { value: 'NLP_ENGINEER', label: 'NLP Engineer' },
  { value: 'AI_INFRASTRUCTURE', label: 'AI Infrastructure' },
  { value: 'OTHER', label: 'Other' },
];

export interface StartupOption {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  headquartersCity: string | null;
}

/** The fields of the post-a-job form. Numbers stay as text until the form is sent. */
export interface JobForm {
  title: string;
  description: string;
  category: string;
  department: string;
  workType: string;
  employmentType: string;
  location: string;
  city: string;
  country: string;
  visaSponsorship: boolean;
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: string;
  showSalary: boolean;
  experienceMin: string;
  experienceMax: string;
  skills: string;
  applicationType: string;
  applicationUrl: string;
  applicationEmail: string;
  listingTier: string;
  isFeatured: boolean;
  isActive: boolean;
}

// Turn the wording found on a company's career page into the values this form uses.

export const normalizeWorkType = (wt: any): string => {
  if (!wt) return '';
  const upper = String(wt).toUpperCase().trim();
  if (upper.includes('REMOTE') || upper.includes('TELECOMMUTE') || upper.includes('WORK FROM HOME') || upper.includes('WFH')) return 'REMOTE';
  if (upper.includes('HYBRID') || upper.includes('FLEXIBLE')) return 'HYBRID';
  if (upper.includes('ONSITE') || upper.includes('ON-SITE') || upper.includes('ON SITE') || upper.includes('IN-OFFICE') || upper.includes('OFFICE')) return 'ONSITE';
  return '';
};

export const normalizeCategory = (cat: any): string => {
  if (!cat) return '';
  const upper = String(cat).toUpperCase().replace(/[\s-]+/g, '_').trim();
  const validCategories = [
    'AI_ENGINEER', 'ML_ENGINEER', 'LLM_ENGINEER', 'AI_RESEARCH_SCIENTIST',
    'DATA_SCIENTIST', 'DATA_ENGINEER', 'PROMPT_ENGINEER', 'AI_PRODUCT_MANAGER',
    'AI_DESIGNER', 'AI_SALES', 'AI_MARKETING', 'AI_DEVREL',
    'AI_SOLUTIONS_ARCHITECT', 'AI_ETHICS', 'ROBOTICS_ENGINEER',
    'COMPUTER_VISION', 'NLP_ENGINEER', 'AI_INFRASTRUCTURE', 'OTHER',
  ];
  if (validCategories.includes(upper)) return upper;
  if (upper.includes('MACHINE_LEARNING') || upper.includes('ML')) return 'ML_ENGINEER';
  if (upper.includes('DATA_SCIEN')) return 'DATA_SCIENTIST';
  if (upper.includes('DATA_ENG')) return 'DATA_ENGINEER';
  if (upper.includes('LLM') || upper.includes('LARGE_LANGUAGE')) return 'LLM_ENGINEER';
  if (upper.includes('NLP') || upper.includes('NATURAL_LANGUAGE')) return 'NLP_ENGINEER';
  if (upper.includes('COMPUTER_VISION') || upper.includes('CV_ENG')) return 'COMPUTER_VISION';
  if (upper.includes('PRODUCT')) return 'AI_PRODUCT_MANAGER';
  if (upper.includes('RESEARCH')) return 'AI_RESEARCH_SCIENTIST';
  if (upper.includes('ROBOT')) return 'ROBOTICS_ENGINEER';
  if (upper.includes('INFRA')) return 'AI_INFRASTRUCTURE';
  if (upper.includes('PROMPT')) return 'PROMPT_ENGINEER';
  if (upper.includes('DESIGN')) return 'AI_DESIGNER';
  if (upper.includes('MARKET')) return 'AI_MARKETING';
  if (upper.includes('SALES')) return 'AI_SALES';
  if (upper.includes('DEVREL') || upper.includes('DEVELOPER_REL')) return 'AI_DEVREL';
  if (upper.includes('SOLUTION')) return 'AI_SOLUTIONS_ARCHITECT';
  if (upper.includes('ETHICS')) return 'AI_ETHICS';
  if (upper.includes('AI') || upper.includes('ARTIFICIAL')) return 'AI_ENGINEER';
  return 'OTHER';
};

export const normalizeEmploymentType = (et: any): string => {
  if (!et) return '';
  const upper = String(et).toUpperCase().replace(/[\s-]+/g, '_').trim();
  if (upper.includes('FULL')) return 'FULL_TIME';
  if (upper.includes('PART')) return 'PART_TIME';
  if (upper.includes('CONTRACT') || upper.includes('TEMPORARY') || upper.includes('TEMP')) return 'CONTRACT';
  if (upper.includes('INTERN')) return 'INTERNSHIP';
  if (upper.includes('FREELAN') || upper.includes('CONSULT')) return 'FREELANCE';
  return '';
};

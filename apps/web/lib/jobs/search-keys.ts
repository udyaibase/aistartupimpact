/** URL params that filter the /jobs list. Shared by the page's client code and the search API. */
export const JOB_SEARCH_KEYS = [
  'category', 'workType', 'experience', 'country', 'city', 'company', 'visa', 'sort', 'q', 'location',
  'employmentType', 'datePosted', 'salaryDisclosed',
] as const;

/** Jobs per page on /jobs (first render and each "Show more"). */
export const JOBS_PAGE_SIZE = 15;

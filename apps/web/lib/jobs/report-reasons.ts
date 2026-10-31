/** Client-safe list of reasons for reporting a job. */
export const JOB_REPORT_REASONS = [
  { value: 'scam', label: 'Fake job or scam' },
  { value: 'asks_money', label: 'Asks candidates to pay money' },
  { value: 'misleading', label: 'Salary or details are misleading' },
  { value: 'filled', label: 'Role is already filled or closed' },
  { value: 'discriminatory', label: 'Discriminatory requirements' },
  { value: 'other', label: 'Something else' },
] as const;

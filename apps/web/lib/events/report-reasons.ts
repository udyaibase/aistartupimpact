/** Client-safe list of reasons for reporting an event. */
export const EVENT_REPORT_REASONS = [
  { value: 'scam', label: 'Fake event or scam' },
  { value: 'asks_money', label: 'Asks for money in a suspicious way' },
  { value: 'misleading', label: 'Misleading details (date, venue, speakers)' },
  { value: 'cancelled', label: 'Event is cancelled or not happening' },
  { value: 'inappropriate', label: 'Offensive or inappropriate' },
  { value: 'other', label: 'Something else' },
] as const;

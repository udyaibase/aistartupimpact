/** Razorpay Route business types (client-safe). */
export const BUSINESS_TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'proprietorship', label: 'Sole proprietorship' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'llp', label: 'LLP' },
  { value: 'private_limited', label: 'Private limited company' },
  { value: 'public_limited', label: 'Public limited company' },
  { value: 'trust', label: 'Trust' },
  { value: 'society', label: 'Society' },
  { value: 'ngo', label: 'NGO' },
  { value: 'not_yet_registered', label: 'Not yet registered' },
] as const;

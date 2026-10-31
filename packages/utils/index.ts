export { generateSlug, generateUniqueSlug } from './slug';
export { calculateReadTime, countWords } from './readTime';
export { formatINR, rupeesToPaise, paiseToRupees, formatINRCompact } from './currency';
export { truncateSeoTitle, truncateSeoDescription, generateCanonicalUrl } from './seo';
export { isDisposableEmail, isFreeEmailProvider, extractEmailDomain } from './src/verification/disposable-emails';
export { CITY_DATABASE, searchCities, standardizeCityName } from './src/cities';
export type { CityEntry } from './src/cities';
export {
  startupApprovalHtml,
  toolApprovalHtml,
  startupRejectionHtml,
  userInvitationHtml,
  submissionReceivedHtml,
  verificationEmailHtml,
  passwordResetHtml,
  jobApplicationHtml,
  paymentSuccessHtml,
  newsletterConfirmHtml,
  newsletterWelcomeHtml,
  organizerVerificationHtml,
  organizerPasswordResetHtml,
  teamInviteHtml,
  founderTeamInviteHtml,
  founderTeamOtpHtml,
  eventRegistrationHtml,
  eventNewsletterWelcomeHtml,
  eventCancellationHtml,
  registrationApprovedHtml,
  registrationRejectedHtml,
  waitlistPromotedHtml,
  otpEmailHtml,
  companyEmailOtpHtml,
  employerPasswordResetHtml,
  securityAlertHtml,
  eventPromotionHtml,
  dailyDigestHtml,
} from './src/email-templates';
export type { EventEmailData, DigestData } from './src/email-templates';


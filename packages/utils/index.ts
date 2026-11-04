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
  toolRejectionHtml,
  claimInviteHtml,
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
  accountLockoutHtml,
  founderNudgeHtml,
  listingEditDecisionHtml,
  eventPromotionHtml,
  dailyDigestHtml,
} from './src/email-templates';
export type { EventEmailData, DigestData } from './src/email-templates';

export { actionsIn, describeActivity, describeDevice } from './src/founder-activity';
export type { ActivityCategory, FounderActivity } from './src/founder-activity';

export { LOGO_SIZES, sizedKey, mediaVariantKeys, ownMediaKey } from './src/media-keys';

export { IDENTITY_FIELDS, canonicalValue, changedListingFields, decideListingEdit, listingFieldLabel, listingValueText, registrableDomain, sameListingValue, websiteDomain } from './src/listing-edit-policy';
export type { ListingFields, ListingType } from './src/listing-edit-policy';

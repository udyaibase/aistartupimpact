/**
 * One look for sign-in, sign-up and code-entry controls everywhere (header box, job pages, employer and founder
 * screens): 44px high, 8px corners (`rounded-md`), 1px borders, 16px text on phones so iOS doesn't zoom on focus.
 * The 6-box code input (components/ui/CodeInput) uses the same height and corners.
 */
export const CONTROL_FIELD =
  'w-full h-11 px-3.5 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base sm:text-[15px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-gray-900 dark:focus:border-white focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/20';
export const CONTROL_LABEL = 'block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1.5';
const BTN = 'w-full h-11 inline-flex items-center justify-center gap-2 px-4 rounded-md text-[15px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
/** The main action on Udyaibase pages (dark). */
export const CONTROL_PRIMARY = `${BTN} bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900`;
/** The main action inside the employer portal (brand red). */
export const CONTROL_PRIMARY_BRAND = `${BTN} bg-[#A50F15] hover:bg-[#8E0D12] text-white`;
export const CONTROL_OUTLINE = `${BTN} border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800`;
/** Small text actions under a form (Back, Resend, Change email): still a 44px tap target. */
export const CONTROL_LINK = 'inline-flex items-center min-h-[44px] px-2 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50';

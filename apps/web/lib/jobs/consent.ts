/** The exact consent shown above the resume upload; stored with each application (DPDP notice). */
export function applyConsentText(companyName: string): string {
  return `Your resume and details are shared with ${companyName} for this role and processed by Udyaibase to run the application, which may include an automated summary to help the hiring team review it (a person makes every decision). `
    + 'If you upload a resume but don’t submit, it is deleted within 24 hours. Applications are deleted 6 months after a decision or 12 months after the job closes, '
    + 'unless you choose to stay in the company’s talent pool. You can withdraw or delete your application at any time from the link we email you.';
}

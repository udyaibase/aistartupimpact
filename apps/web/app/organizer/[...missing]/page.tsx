import { notFound } from 'next/navigation';

export const metadata = { title: 'Page not found' };

/** Any /organizer address that isn't a page: answer 404 with the portal's own "not found" (see ../not-found.tsx). */
export default function OrganizerMissingPage() {
  notFound();
}

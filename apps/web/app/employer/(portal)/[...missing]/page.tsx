import { notFound } from 'next/navigation';

/** Any /employer address that isn't a page: answer 404 with the portal's own "not found" (see ../not-found.tsx). */
export default function EmployerMissingPage() {
  notFound();
}

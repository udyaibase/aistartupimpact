import { redirect } from 'next/navigation';

export const metadata = { title: 'Profile' };

// Organizer accounts are separate from the main site's account: the organizer's own details live in
// Settings (account) and Organization (public profile). The main-site profile page sent organizers home.
export default function OrganizerProfilePage() {
  redirect('/organizer/settings');
}

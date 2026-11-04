import { requireFounderAuth } from '@/lib/founder-auth';
import SecuritySection from './SecuritySection';
import SettingsClient from './SettingsClient';

export default async function SettingsPage() {
  const session = await requireFounderAuth();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="portal-title">
          Settings
        </h1>
        <p className="portal-subtitle">
          Manage your account preferences and security settings
        </p>
      </div>

      {/* Notifications & Privacy */}
      <SettingsClient />

      {/* Security */}
      <SecuritySection />
    </div>
  );
}

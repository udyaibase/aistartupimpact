'use client';

import { useState, useEffect } from 'react';
import { Eye, Mail } from 'lucide-react';
import Toggle from '@/components/Toggle';
import Toast from '@/components/Toast';
import CompanyEmailSection from '@/components/CompanyEmailSection';

type ToastType = {
  type: 'success' | 'error' | 'info';
  message: string;
} | null;

interface SettingsData {
  publicProfile: boolean;
  emailNotifications: boolean;
}

export default function SettingsClient() {
  const [settings, setSettings] = useState<SettingsData>({ publicProfile: true, emailNotifications: true });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastType>(null);

  // Load settings from API
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch('/api/founder/settings');
        const data = await res.json();
        
        if (data.success) {
          setSettings({ publicProfile: data.settings.publicProfile !== false, emailNotifications: data.settings.emailNotifications !== false });
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    
    loadSettings();
  }, []);

  const handleToggle = async (key: keyof SettingsData, value: boolean) => {
    // Optimistic update
    const previousSettings = { ...settings };
    setSettings(prev => ({ ...prev, [key]: value }));
    setLoading(true);

    try {
      const res = await fetch('/api/founder/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });

      const data = await res.json();

      if (data.success) {
        setToast({
          type: 'success',
          message: 'Settings updated successfully'
        });
      } else {
        // Revert on error
        setSettings(previousSettings);
        setToast({
          type: 'error',
          message: data.error || 'Failed to update settings'
        });
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      // Revert on error
      setSettings(previousSettings);
      setToast({
        type: 'error',
        message: 'Failed to update settings. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Toast Notification */}
      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

      {/* Company Email Verification */}
      <CompanyEmailSection apiBasePath="/api/founder" />

      {/* Privacy */}
      <div className="bg-white dark:bg-gray-900 rounded-[14px] border border-gray-200 dark:border-gray-800">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
          <Eye className="w-4 h-4 text-gray-400" aria-hidden />
          <h2 className="portal-section-title">Privacy</h2>
        </div>
        <div className="p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Show me on my startup’s profile</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Your name, role, bio, photo and links appear on your startup’s public profile. Turn this off to hide them.</p>
          </div>
          <Toggle enabled={settings.publicProfile} onChange={(value) => handleToggle('publicProfile', value)} disabled={loading} />
        </div>
      </div>

      {/* Emails */}
      <div className="bg-white dark:bg-gray-900 rounded-[14px] border border-gray-200 dark:border-gray-800">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="portal-section-title">Emails from us</h2>
        </div>
        <div className="p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Tips and reports</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Your profile views and ideas for your listing, at most once a week.</p>
          </div>
          <Toggle enabled={settings.emailNotifications} onChange={(value) => handleToggle('emailNotifications', value)} disabled={loading} />
        </div>
        <p className="px-4 pb-4 text-xs text-gray-600 dark:text-gray-400">
          We always email you about your account, security and listing reviews, because the service needs them. Our newsletter is separate: use the unsubscribe link in any issue to stop it.
        </p>
      </div>

      {/* Info */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <Mail className="w-4 h-4 text-gray-400 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
              Need Help?
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Contact our support team at support@udyaibase.com for assistance with your account settings.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

import { requireFounderAuth } from '@/lib/founder-auth';
import { redirect } from 'next/navigation';
import ToolForm from '@/components/founder/ToolForm';
import { founderAtToolLimit } from '@/lib/founder/limits';

export default async function NewToolPage() {
  const session = await requireFounderAuth();
  if (await founderAtToolLimit(session.userId)) redirect('/founder/tools');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="portal-title">
          Submit Your AI Tool
        </h1>
        <p className="portal-subtitle">
          Share your AI tool with the community. Our team will review your submission within 2-3 business days.
        </p>
      </div>

      {/* Form */}
      <ToolForm />
    </div>
  );
}

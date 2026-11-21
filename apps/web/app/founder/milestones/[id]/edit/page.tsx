import MilestoneForm from '@/components/founder/MilestoneForm';

export const metadata = { title: 'Edit milestone' };

export default async function EditMilestonePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <MilestoneForm milestoneId={id} />;
}

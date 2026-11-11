/** Shared heading block for About page sections: eyebrow pill, title and an optional one-line subtitle. */
export default function SectionHeader({
  id,
  eyebrow,
  title,
  subtitle,
  align = 'center',
}: {
  id: string;
  eyebrow: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: 'center' | 'left';
}) {
  const center = align === 'center';
  return (
    <div className={`mb-8 sm:mb-12 ${center ? 'text-center mx-auto max-w-2xl' : 'max-w-2xl'}`}>
      <span className="inline-flex items-center gap-2 rounded-full border border-[color:color-mix(in_srgb,var(--brand-color)_25%,transparent)] bg-[color:color-mix(in_srgb,var(--brand-color)_8%,transparent)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-brand font-sora">
        <span className="w-1.5 h-1.5 rounded-full bg-brand" aria-hidden="true" />
        {eyebrow}
      </span>
      <h2 id={id} className="mt-4 font-sora font-extrabold tracking-tight text-2xl sm:text-4xl text-navy dark:text-white">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 sm:mt-4 font-jakarta text-sm sm:text-lg text-gray-500 dark:text-gray-400 leading-relaxed">{subtitle}</p>
      )}
    </div>
  );
}

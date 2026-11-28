import PlanPricesClient from '@/components/billing/PlanPricesClient';
import { card } from '@/components/billing/parts';
import { loadPlanPrices } from '@/lib/billing/plan-prices-load';

export const dynamic = 'force-dynamic';

/** Plans & prices: the prices and limits of hiring plans, host plans, Event Boost and funding packs, kept as dated versions. */
export default async function PlanPricesPage() {
  const view = await loadPlanPrices();
  if (!view.ready) {
    return (
      <p role="status" className={`${card} p-5 text-sm text-gray-700 dark:text-gray-300`}>
        Editing plans needs a database change that has not been applied yet (migration <span className="font-mono">20261203090000_plan_catalog</span>, one new table).
        Nothing is broken meanwhile: the prices and limits built into the product apply.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      <p className={`${card} px-4 py-3 text-sm text-gray-700 dark:text-gray-300`}>
        Change a price or a limit here and it applies everywhere: pricing pages, checkout, invoices, plan limits and this admin.
        Every save is a new dated version, so you can schedule a change and go back to an earlier one. Adding or removing a whole plan still needs a developer.
      </p>
      <PlanPricesClient view={view} />
    </div>
  );
}

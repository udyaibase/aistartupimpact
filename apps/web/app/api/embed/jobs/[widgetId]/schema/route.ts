import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { careersJobPostings, getCareersCompany, getCareersJobs } from "@/lib/jobs/careers";

export const revalidate = 60;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://udyaibase.com";
const CORS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=60, s-maxage=60" };

/**
 * Boot config for the loader: whether the careers widget is active, where it may run,
 * and JobPosting markup to put in the host page's <head> (verified companies only).
 * The loader reads `events` for the markup so both widget kinds share one code path.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ widgetId: string }> }) {
  const { widgetId } = await params;
  const inactive = NextResponse.json({ active: false, allowedDomains: [], events: [] }, { headers: CORS });
  if (!/^[0-9a-f-]{36}$/i.test(widgetId)) return inactive;

  const widget = await prisma.jobBoardCareersWidget.findUnique({ where: { id: widgetId } });
  if (!widget || !widget.active) return inactive;
  const company = await getCareersCompany({ id: widget.employerId });
  if (!company) return inactive;
  const jobs = await getCareersJobs(widget.employerId, widget.departments);

  return NextResponse.json(
    { active: true, allowedDomains: widget.allowedDomains, events: careersJobPostings(company, jobs, SITE) },
    { headers: CORS },
  );
}

import type { Metadata } from "next";
import { prisma } from "@udyaibase/database";
import JobsWidgetView, { type JobsWidgetConfig } from "@/components/embed/JobsWidgetView";
import EmbedEmptyState from "@/components/embed/EmbedEmptyState";
import { getCareersCompany, getCareersJobs } from "@/lib/jobs/careers";
import { effectivePlan } from "@/lib/employer/plans";

export const revalidate = 60;

export const metadata: Metadata = { title: "Open roles", robots: { index: false, follow: false } };

const pick = <T extends string>(v: string, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

export default async function JobsEmbedPage({ params }: { params: Promise<{ widgetId: string }> }) {
  const { widgetId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(widgetId)) return <EmbedEmptyState />;

  const widget = await prisma.jobBoardCareersWidget.findUnique({ where: { id: widgetId } });
  if (!widget || !widget.active) return <EmbedEmptyState />;
  const company = await getCareersCompany({ id: widget.employerId });
  if (!company) return <EmbedEmptyState />;
  const [jobs, employer] = await Promise.all([
    getCareersJobs(widget.employerId, widget.departments),
    prisma.jobBoardEmployer.findUnique({ where: { id: widget.employerId }, select: { plan: true, planExpiresAt: true, planIsTrial: true } }),
  ]);
  // Free always shows the link; paid plans may hide it (and it comes back if the plan lapses).
  const canHideBranding = !!employer && effectivePlan(employer).customBranding;

  const config: JobsWidgetConfig = {
    id: widget.id,
    layout: pick(widget.layout, ["auto", "grid", "list", "compact"] as const, "auto"),
    accentColor: widget.accentColor,
    darkMode: pick(widget.darkMode, ["auto", "light", "dark"] as const, "auto"),
    cornerStyle: pick(widget.cornerStyle, ["sharp", "rounded", "pill"] as const, "rounded"),
    buttonText: widget.buttonText,
    heading: widget.heading,
    subheading: widget.subheading,
    headingAlign: pick(widget.headingAlign, ["left", "center"] as const, "left"),
    headingSize: pick(widget.headingSize, ["sm", "md", "lg"] as const, "md"),
    fontFamily: widget.fontFamily,
    textScale: pick(widget.textScale, ["sm", "md", "lg"] as const, "md"),
    buttonSize: pick(widget.buttonSize, ["sm", "md", "lg"] as const, "md"),
    buttonStyle: pick(widget.buttonStyle, ["filled", "outline", "soft"] as const, "filled"),
    cardStyle: pick(widget.cardStyle, ["bordered", "elevated", "flat"] as const, "bordered"),
    spacing: pick(widget.spacing, ["compact", "comfortable", "spacious"] as const, "comfortable"),
    maxJobs: widget.maxJobs,
    showLogo: widget.showLogo,
    showDepartment: widget.showDepartment,
    showSalary: widget.showSalary,
    showSkills: widget.showSkills,
    showPoweredBy: widget.showPoweredBy || !canHideBranding,
    company: { name: company.name, logoUrl: company.logoUrl, slug: company.slug },
  };

  return <JobsWidgetView config={config} jobs={jobs} />;
}

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import PortalGuide, { tourSeen } from "./PortalGuide";
import { tourForPath } from "./tours";

export const OPEN_GUIDE_EVENT = "udyaibase:open-guide";

/** Opens a guide for the current organizer page: automatically on first visit, or on demand. */
export function openGuide() {
  window.dispatchEvent(new Event(OPEN_GUIDE_EVENT));
}

export default function GuideHost() {
  const pathname = usePathname();
  const tour = tourForPath(pathname);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
    if (!tour || tourSeen(tour.id)) return;
    if (new URLSearchParams(window.location.search).has("customize")) return;
    // Client-rendered pages load their data after mount; give anchors a moment to appear.
    const t = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(t);
  }, [tour]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_GUIDE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, onOpen);
  }, []);

  if (!tour) return null;
  return <PortalGuide tour={tour} open={open} onClose={() => setOpen(false)} />;
}

export function hasGuide(pathname: string): boolean {
  return !!tourForPath(pathname);
}

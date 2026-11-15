"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Smartphone, Sun, Tablet } from "lucide-react";
import type { CareersPageData } from "@/components/careers/CareersPage";

const DEVICES = {
  desktop: { label: "Desktop", width: 1280, height: 820, icon: Monitor },
  tablet: { label: "Tablet", width: 820, height: 1000, icon: Tablet },
  mobile: { label: "Mobile", width: 390, height: 780, icon: Smartphone },
} as const;
type Device = keyof typeof DEVICES;

/**
 * The real careers page in a frame at a true device width, scaled down to fit, updating as the content changes.
 * Breakpoints inside the frame follow the device width, so tablet and mobile layouts are exactly what candidates see.
 */
export default function DevicePreview({ data, initialDevice, compact = false }: {
  data: CareersPageData;
  /** Default: Mobile on phones, Desktop elsewhere. */
  initialDevice?: Device;
  /** Smaller frame (template gallery modal uses full size). */
  compact?: boolean;
}) {
  const [device, setDevice] = useState<Device>(initialDevice ?? "desktop");
  useEffect(() => { if (!initialDevice && window.innerWidth < 768) setDevice("mobile"); }, [initialDevice]);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [box, setBox] = useState(0);
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === "udyaibase:careers-preview-ready" && e.source === frame.current?.contentWindow) setReady(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    frame.current?.contentWindow?.postMessage({ type: "udyaibase:careers-preview", data, theme }, window.location.origin);
  }, [ready, data, theme]);

  const d = DEVICES[device];
  const height = compact ? Math.round(d.height * 0.8) : d.height;
  const scale = box ? Math.min(1, box / d.width) : 1;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div role="radiogroup" aria-label="Preview size" className="inline-flex rounded-[10px] border border-gray-200 dark:border-gray-800 p-0.5 bg-white dark:bg-gray-900">
          {(Object.keys(DEVICES) as Device[]).map((k) => {
            const D = DEVICES[k];
            const on = device === k;
            return (
              <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setDevice(k)}
                className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 sm:px-3 rounded-[8px] text-sm font-medium transition-colors ${on ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"}`}>
                <D.icon className="w-4 h-4" aria-hidden /><span className="hidden sm:inline">{D.label}</span><span className="sr-only sm:hidden">{D.label}</span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))} aria-label={theme === "light" ? "Preview in dark mode" : "Preview in light mode"}
          className="inline-flex items-center justify-center w-9 h-9 rounded-[10px] border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
          {theme === "light" ? <Moon className="w-4 h-4" aria-hidden /> : <Sun className="w-4 h-4" aria-hidden />}
        </button>
      </div>
      <div ref={wrap} className="w-full">
        <div className="mx-auto overflow-hidden rounded-[14px] border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 shadow-sm"
          style={{ width: d.width * scale, height: height * scale }}>
          <iframe ref={frame} src="/embed/careers-preview" title={`Careers page preview, ${d.label.toLowerCase()}`}
            style={{ width: d.width, height, transform: `scale(${scale})`, transformOrigin: "top left", border: 0, display: "block" }} />
        </div>
      </div>
    </div>
  );
}

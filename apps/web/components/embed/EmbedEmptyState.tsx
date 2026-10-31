"use client";

import { useEffect } from "react";

export default function EmbedEmptyState() {
  useEffect(() => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: "udyaibase:resize", height: 0 }, "*");
    }
  }, []);

  return <div style={{ margin: 0, padding: 0, background: "transparent" }} />;
}

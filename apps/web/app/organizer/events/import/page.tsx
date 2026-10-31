"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Upload, FileSpreadsheet, AlertCircle, Check,
  Loader2, Download, X,
} from "lucide-react";

interface ParsedEvent {
  title: string;
  category: string;
  startDate: string;
  startTime: string;
  endTime: string;
  endDate: string;
  format: string;
  venueName: string;
  address: string;
  city: string;
  meetingLink: string;
  capacity: string;
  description: string;
  errors: string[];
}

const REQUIRED_HEADERS = ["title", "start_date", "start_time", "end_time"];
const ALL_HEADERS = [
  "title", "category", "start_date", "start_time", "end_time", "end_date",
  "format", "venue_name", "address", "city", "meeting_link", "capacity", "description",
];

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_").replace(/"/g, ""));
  const rows = lines.slice(1).map(line => {
    const vals: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { vals.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    vals.push(current.trim());
    return vals;
  });
  return { headers, rows };
}

function validateRow(headers: string[], vals: string[], rowIndex: number): ParsedEvent {
  const get = (key: string) => {
    const idx = headers.indexOf(key);
    return idx >= 0 && idx < vals.length ? vals[idx] : "";
  };

  const errors: string[] = [];
  const title = get("title");
  const startDate = get("start_date");
  const startTime = get("start_time");
  const endTime = get("end_time");

  if (!title) errors.push("Title is required");
  if (!startDate) errors.push("Start date is required");
  if (!startTime) errors.push("Start time is required");
  if (!endTime) errors.push("End time is required");

  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    errors.push("Start date must be YYYY-MM-DD");
  }

  const category = (get("category") || "CONFERENCE").toUpperCase();
  const format = (get("format") || "IN_PERSON").toUpperCase().replace(/\s+/g, "_");

  return {
    title,
    category,
    startDate,
    startTime,
    endTime,
    endDate: get("end_date"),
    format,
    venueName: get("venue_name"),
    address: get("address"),
    city: get("city"),
    meetingLink: get("meeting_link"),
    capacity: get("capacity"),
    description: get("description"),
    errors,
  };
}

export default function ImportEventsPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedEvent[]>([]);
  const [parseError, setParseError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      setParseError("Please upload a CSV file");
      return;
    }
    setFileName(file.name);
    setParseError("");
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);

      const missing = REQUIRED_HEADERS.filter(h => !headers.includes(h));
      if (missing.length > 0) {
        setParseError(`Missing required columns: ${missing.join(", ")}. Required: ${REQUIRED_HEADERS.join(", ")}`);
        setParsed([]);
        return;
      }

      const events = rows.map((vals, i) => validateRow(headers, vals, i));
      setParsed(events);
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const validCount = parsed.filter(e => e.errors.length === 0).length;
  const errorCount = parsed.filter(e => e.errors.length > 0).length;

  const handleImport = async () => {
    const validEvents = parsed.filter(e => e.errors.length === 0);
    if (validEvents.length === 0) return;

    setImporting(true);
    let success = 0;
    let failed = 0;

    for (const evt of validEvents) {
      try {
        const res = await fetch("/api/organizer/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: evt.title,
            category: evt.category,
            startAt: evt.startDate && evt.startTime ? `${evt.startDate}T${evt.startTime}` : undefined,
            endAt: evt.endDate && evt.endTime
              ? `${evt.endDate}T${evt.endTime}`
              : evt.startDate && evt.endTime
                ? `${evt.startDate}T${evt.endTime}`
                : undefined,
            format: evt.format,
            venueName: evt.venueName || undefined,
            address: evt.address || undefined,
            city: evt.city || undefined,
            meetingLink: evt.meetingLink || undefined,
            capacity: evt.capacity ? parseInt(evt.capacity) : undefined,
            description: evt.description || undefined,
            status: "DRAFT",
          }),
        });
        if (res.ok) success++;
        else failed++;
      } catch {
        failed++;
      }
    }

    setImporting(false);
    setImportResult({ success, failed });
  };

  const downloadTemplate = () => {
    const csv = ALL_HEADERS.join(",") + "\n" +
      'My Tech Conference,CONFERENCE,2025-03-15,09:00,18:00,,IN_PERSON,Grand Hall,"123 Main St",Bangalore,,500,"A one-day tech conference"\n' +
      'Webinar: AI Trends,WEBINAR,2025-04-01,14:00,15:30,,VIRTUAL,,,,https://meet.google.com/abc,,A deep dive into AI trends';
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "events-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link href="/organizer/events" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-brand font-jakarta mb-2 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to events
        </Link>
        <h1 className="portal-title">Import events</h1>
        <p className="portal-subtitle">Upload a CSV file to bulk-create events. All imported events start as drafts.</p>
      </div>

      {/* Download template */}
      <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md mb-6">
        <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 font-jakarta">Need a template?</p>
          <p className="text-xs text-blue-600 dark:text-blue-400 font-jakarta">Download our CSV template with the correct column headers and example rows.</p>
        </div>
        <button onClick={downloadTemplate} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold font-jakarta rounded-md transition-colors shrink-0">
          <Download className="w-3.5 h-3.5" />
          Template
        </button>
      </div>

      {/* Upload area */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`relative border-2 border-dashed rounded-md p-10 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-brand bg-brand-50 dark:bg-brand-900/20"
            : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-jakarta">
          {fileName || "Drop your CSV file here or click to browse"}
        </p>
        <p className="text-xs text-gray-400 font-jakarta mt-1">
          Required columns: title, start_date, start_time, end_time
        </p>
      </div>

      {/* Parse error */}
      {parseError && (
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md mt-4">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400 font-jakarta">{parseError}</p>
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md mt-4">
          <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-green-700 dark:text-green-400 font-jakarta">
              Import complete — {importResult.success} event{importResult.success !== 1 ? "s" : ""} created as drafts
            </p>
            {importResult.failed > 0 && (
              <p className="text-xs text-red-600 font-jakarta mt-1">{importResult.failed} event{importResult.failed !== 1 ? "s" : ""} failed to import</p>
            )}
            <Link href="/organizer/events" className="text-sm text-brand font-semibold font-jakarta hover:underline mt-2 inline-block">
              View your events →
            </Link>
          </div>
        </div>
      )}

      {/* Parsed events table */}
      {parsed.length > 0 && !importResult && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="portal-section-title">
                {parsed.length} event{parsed.length !== 1 ? "s" : ""} found
              </h2>
              {validCount > 0 && (
                <span className="text-xs font-semibold text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded font-jakarta">
                  {validCount} ready
                </span>
              )}
              {errorCount > 0 && (
                <span className="text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded font-jakarta">
                  {errorCount} with errors
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setParsed([]); setFileName(""); }}
                className="px-3 py-2 text-xs font-semibold font-jakarta border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-300"
              >
                Clear
              </button>
              <button
                onClick={handleImport}
                disabled={importing || validCount === 0}
                className="flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand/90 text-white text-xs font-bold font-jakarta rounded-md disabled:opacity-50 transition-colors"
              >
                {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Import {validCount} event{validCount !== 1 ? "s" : ""}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider font-jakarta w-8">#</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider font-jakarta">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider font-jakarta">Title</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider font-jakarta">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider font-jakarta">Time</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider font-jakarta">Format</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider font-jakarta">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {parsed.map((evt, i) => (
                    <tr key={i} className={evt.errors.length > 0 ? "bg-red-50/50 dark:bg-red-900/10" : ""}>
                      <td className="px-4 py-3 text-gray-400 font-jakarta">{i + 1}</td>
                      <td className="px-4 py-3">
                        {evt.errors.length === 0 ? (
                          <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </span>
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                            <X className="w-3 h-3 text-white" />
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800 dark:text-white font-jakarta">{evt.title || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-jakarta">{evt.startDate || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-jakarta">{evt.startTime}{evt.endTime && ` – ${evt.endTime}`}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-jakarta">
                          {evt.format.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {evt.errors.length > 0 && (
                          <span className="text-xs text-red-600 font-jakarta">{evt.errors.join("; ")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

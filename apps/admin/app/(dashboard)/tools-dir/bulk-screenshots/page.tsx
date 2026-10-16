'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Camera, Loader2, CheckCircle2, XCircle, AlertTriangle, Play, Square, RotateCcw, Image, Search } from 'lucide-react';
import Link from 'next/link';
import { getToolsForBulkScreenshotsAction } from '../actions';

type ToolStatus = 'pending' | 'capturing' | 'done' | 'failed' | 'needs_review';
type FilterMode = 'no_screenshots' | 'under_max' | 'all';

interface ToolItem {
  id: string;
  name: string;
  slug: string;
  websiteUrl: string;
  logoUrl: string | null;
  screenshotUrls: string[];
  screenshotMeta: Record<string, any> | null;
  status: string;
  jobStatus: ToolStatus;
  error?: string;
  sizeBytes?: number;
  capturesDone: number;
}

export default function BulkScreenshotsPage() {
  const [tools, setTools] = useState<ToolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<FilterMode>('no_screenshots');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [delay, setDelay] = useState(2);
  const [capturesPerTool, setCapturesPerTool] = useState(1);
  const stopRef = useRef(false);

  const loadTools = async (filterMode: FilterMode) => {
    setLoading(true);
    try {
      const result = await getToolsForBulkScreenshotsAction(filterMode) as any;
      if (result.success && result.tools) {
        const items = result.tools.map((t: any) => ({
          ...t,
          screenshotUrls: t.screenshotUrls || [],
          jobStatus: 'pending' as ToolStatus,
          capturesDone: 0,
        }));
        setTools(items);
        setSelectedIds(new Set(items.map((t: ToolItem) => t.id)));
      }
    } catch (err) {
      console.error('Failed to load tools:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTools(filter);
  }, [filter]);

  const filteredTools = search
    ? tools.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.websiteUrl.toLowerCase().includes(search.toLowerCase()))
    : tools;

  const stats = {
    total: tools.length,
    selected: selectedIds.size,
    done: tools.filter(t => t.jobStatus === 'done').length,
    failed: tools.filter(t => t.jobStatus === 'failed').length,
    needsReview: tools.filter(t => t.jobStatus === 'needs_review').length,
    pending: tools.filter(t => t.jobStatus === 'pending' && selectedIds.has(t.id)).length,
    capturing: tools.filter(t => t.jobStatus === 'capturing').length,
  };

  const processed = stats.done + stats.failed + stats.needsReview;
  const progress = stats.total > 0 ? (processed / stats.total) * 100 : 0;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredTools.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTools.map(t => t.id)));
    }
  };

  const captureOne = async (tool: ToolItem, variation = 0): Promise<{ status: ToolStatus; error?: string; sizeBytes?: number }> => {
    try {
      const res = await fetch(`/api/admin/tools/${tool.id}/screenshot?variation=${variation}`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        return { status: 'failed', error: data.error || `HTTP ${res.status}` };
      }

      if (data.needsReview) {
        return { status: 'needs_review', sizeBytes: data.sizeBytes };
      }

      return { status: 'done', sizeBytes: data.sizeBytes };
    } catch (err: any) {
      return { status: 'failed', error: err.message || 'Network error' };
    }
  };

  const startBulk = async () => {
    setRunning(true);
    stopRef.current = false;

    const toProcess = tools.filter(
      t => selectedIds.has(t.id) && (t.jobStatus === 'pending' || t.jobStatus === 'failed')
    );

    for (let i = 0; i < toProcess.length; i++) {
      if (stopRef.current) break;

      const tool = toProcess[i];
      const currentScreenshots = tool.screenshotUrls.length;
      const maxCaptures = Math.min(capturesPerTool, 5 - currentScreenshots);

      if (maxCaptures <= 0) {
        setTools(prev =>
          prev.map(t => t.id === tool.id ? { ...t, jobStatus: 'done' as ToolStatus, capturesDone: 0 } : t)
        );
        continue;
      }

      setTools(prev =>
        prev.map(t => t.id === tool.id ? { ...t, jobStatus: 'capturing' as ToolStatus, error: undefined } : t)
      );

      let lastResult: { status: ToolStatus; error?: string; sizeBytes?: number } = { status: 'done' };
      let capturedCount = 0;

      for (let c = 0; c < maxCaptures; c++) {
        if (stopRef.current) break;

        setTools(prev =>
          prev.map(t => t.id === tool.id ? { ...t, capturesDone: c + 1 } : t)
        );

        lastResult = await captureOne(tool, currentScreenshots + c);

        if (lastResult.status === 'failed') break;

        capturedCount++;

        // Delay between captures for the same tool
        if (c < maxCaptures - 1 && !stopRef.current) {
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
      }

      setTools(prev =>
        prev.map(t =>
          t.id === tool.id
            ? { ...t, jobStatus: lastResult.status, error: lastResult.error, sizeBytes: lastResult.sizeBytes, capturesDone: capturedCount }
            : t
        )
      );

      // Delay between tools
      if (i < toProcess.length - 1 && !stopRef.current) {
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
      }
    }

    setRunning(false);
  };

  const stopBulk = () => {
    stopRef.current = true;
  };

  const retryOne = async (toolId: string) => {
    const tool = tools.find(t => t.id === toolId);
    if (!tool) return;

    setTools(prev =>
      prev.map(t => t.id === toolId ? { ...t, jobStatus: 'capturing' as ToolStatus, error: undefined, capturesDone: 0 } : t)
    );

    const result = await captureOne(tool);

    setTools(prev =>
      prev.map(t =>
        t.id === toolId
          ? { ...t, jobStatus: result.status, error: result.error, sizeBytes: result.sizeBytes, capturesDone: result.status === 'done' ? 1 : 0 }
          : t
      )
    );
  };

  const retryAllFailed = () => {
    setTools(prev =>
      prev.map(t =>
        t.jobStatus === 'failed' ? { ...t, jobStatus: 'pending' as ToolStatus, error: undefined, capturesDone: 0 } : t
      )
    );
  };

  const statusIcon = (status: ToolStatus) => {
    switch (status) {
      case 'done':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'needs_review':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'capturing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600" />;
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/tools-dir"
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="font-sora font-bold text-2xl text-navy dark:text-white">
            Bulk Screenshot Capture
          </h1>
          <p className="text-sm text-gray-500 font-jakarta mt-1">
            Auto-capture screenshots for AI tools • Up to 5 per tool
          </p>
        </div>
      </div>

      {/* Warning */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800 dark:text-amber-300 font-jakarta">
            <p className="font-semibold mb-1">Keep this tab open while the queue runs.</p>
            <p>Each capture takes 10–20 seconds. Manual screenshots are never touched. Set "Captures per tool" to get multiple different screenshots per tool.</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 font-jakarta">Show:</span>
            <select
              value={filter}
              onChange={(e) => { setFilter(e.target.value as FilterMode); }}
              disabled={running}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="no_screenshots">No screenshots (0)</option>
              <option value="under_max">Under 5 screenshots</option>
              <option value="all">All tools</option>
            </select>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search tools..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          {/* Captures per tool */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 font-jakarta">Per tool:</span>
            <select
              value={capturesPerTool}
              onChange={(e) => setCapturesPerTool(Number(e.target.value))}
              disabled={running}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value={1}>1 screenshot</option>
              <option value={2}>2 screenshots</option>
              <option value={3}>3 screenshots</option>
              <option value={4}>4 screenshots</option>
              <option value={5}>5 screenshots</option>
            </select>
          </div>

          {/* Delay */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 font-jakarta">Delay:</span>
            <select
              value={delay}
              onChange={(e) => setDelay(Number(e.target.value))}
              disabled={running}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value={1}>1s</option>
              <option value={2}>2s</option>
              <option value={3}>3s</option>
              <option value={5}>5s</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Select all */}
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.size === filteredTools.length && filteredTools.length > 0}
              onChange={toggleAll}
              disabled={running}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300 font-jakarta">
              Select all ({filteredTools.length})
            </span>
          </label>

          <span className="text-xs text-gray-400 font-jakarta">
            {selectedIds.size} selected • {capturesPerTool > 1 ? `${capturesPerTool} captures each` : '1 capture each'}
          </span>

          <div className="flex-1" />

          {/* Action buttons */}
          {!running ? (
            <div className="flex items-center gap-3">
              {stats.failed > 0 && (
                <button
                  onClick={retryAllFailed}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-400 text-sm font-medium rounded-lg transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Retry {stats.failed} failed
                </button>
              )}
              <button
                onClick={startBulk}
                disabled={loading || stats.pending === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <Play className="w-4 h-4" />
                Start ({stats.pending} tools)
              </button>
            </div>
          ) : (
            <button
              onClick={stopBulk}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              <Square className="w-4 h-4" />
              Stop
            </button>
          )}
        </div>

        {/* Progress bar */}
        {(processed > 0 || running) && (
          <div className="space-y-2">
            <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex items-center gap-4 text-xs font-jakarta text-gray-500">
              <span className="text-green-600 font-semibold">{stats.done} done</span>
              {stats.needsReview > 0 && (
                <span className="text-amber-600 font-semibold">{stats.needsReview} needs review</span>
              )}
              {stats.failed > 0 && (
                <span className="text-red-600 font-semibold">{stats.failed} failed</span>
              )}
              <span>{stats.pending} remaining</span>
              {running && stats.capturing > 0 && (
                <span className="text-blue-600 animate-pulse">Capturing...</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tools list */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-brand" />
            <span className="ml-3 text-sm text-gray-500 font-jakarta">Loading tools...</span>
          </div>
        ) : filteredTools.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Image className="w-12 h-12 mb-3" />
            <p className="font-jakarta text-sm">
              {search ? 'No tools match your search' : 'No tools found for this filter'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {/* Table header */}
            <div className="grid grid-cols-12 gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 text-xs font-bold text-gray-500 uppercase tracking-wider font-jakarta">
              <div className="col-span-1"></div>
              <div className="col-span-1">Status</div>
              <div className="col-span-3">Tool</div>
              <div className="col-span-3">Website</div>
              <div className="col-span-1">Shots</div>
              <div className="col-span-1">Size</div>
              <div className="col-span-2 text-right">Action</div>
            </div>

            {/* Tool rows */}
            {filteredTools.map((tool) => (
              <div
                key={tool.id}
                className={`grid grid-cols-12 gap-3 px-4 py-3 items-center text-sm transition-colors ${
                  tool.jobStatus === 'capturing'
                    ? 'bg-blue-50/50 dark:bg-blue-900/10'
                    : tool.jobStatus === 'failed'
                    ? 'bg-red-50/30 dark:bg-red-900/10'
                    : tool.jobStatus === 'needs_review'
                    ? 'bg-amber-50/30 dark:bg-amber-900/10'
                    : ''
                }`}
              >
                {/* Checkbox */}
                <div className="col-span-1">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(tool.id)}
                    onChange={() => toggleSelect(tool.id)}
                    disabled={running}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>

                {/* Status */}
                <div className="col-span-1 flex items-center gap-1">
                  {statusIcon(tool.jobStatus)}
                  {tool.jobStatus === 'capturing' && capturesPerTool > 1 && (
                    <span className="text-[10px] text-blue-500 font-bold">{tool.capturesDone}/{capturesPerTool}</span>
                  )}
                </div>

                {/* Tool name + logo */}
                <div className="col-span-3 flex items-center gap-3 min-w-0">
                  {tool.logoUrl ? (
                    <img
                      src={tool.logoUrl}
                      alt=""
                      className="w-7 h-7 rounded-lg object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                      <Camera className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate text-xs font-jakarta">
                      {tool.name}
                    </p>
                    {tool.error && (
                      <p className="text-[10px] text-red-500 truncate">{tool.error}</p>
                    )}
                  </div>
                </div>

                {/* Website */}
                <div className="col-span-3 truncate text-gray-500 text-xs font-jakarta">
                  {tool.websiteUrl}
                </div>

                {/* Screenshot count */}
                <div className="col-span-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    tool.screenshotUrls.length === 0
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      : tool.screenshotUrls.length >= 5
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  }`}>
                    {tool.screenshotUrls.length}/5
                  </span>
                </div>

                {/* Size */}
                <div className="col-span-1 text-xs text-gray-400 font-jakarta">
                  {tool.sizeBytes ? `${(tool.sizeBytes / 1024).toFixed(0)} KB` : '—'}
                </div>

                {/* Action */}
                <div className="col-span-2 flex justify-end gap-2">
                  {(tool.jobStatus === 'failed' || tool.jobStatus === 'needs_review') && !running && (
                    <button
                      onClick={() => retryOne(tool.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Retry
                    </button>
                  )}
                  {tool.jobStatus === 'done' && (
                    <span className="text-xs text-green-600 font-medium font-jakarta">
                      {tool.capturesDone > 0 ? `+${tool.capturesDone}` : 'Done'}
                    </span>
                  )}
                  {tool.jobStatus === 'capturing' && (
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  )}
                  {tool.jobStatus === 'pending' && !running && (
                    <button
                      onClick={() => retryOne(tool.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Capture
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

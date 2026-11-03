'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Image as ImageIcon, Search, Trash2, CheckCircle2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { listMediaAction, uploadMediaFileAction, deleteMediaAction } from '../app/(dashboard)/media/actions';

// Helper for standardizing tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface MediaFile {
  id: string;
  key: string;
  name: string;
  url: string;
  size: string;
  sizeBytes: number;
  mimeType: string;
  slug: string;
  width: number | null;
  height: number | null;
  alt: string | null;
  tags: string[];
  prefix: string;
  backfilled: boolean;
  usageCount: number;
  uploadedAt: string;
}

interface MediaPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  title?: string;
}

export default function MediaPicker({ isOpen, onClose, onSelect, title = "Select Media" }: MediaPickerProps) {
  const [activeTab, setActiveTab] = useState<'library' | 'upload'>('library');
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search waits for a pause in typing instead of querying on every keystroke.
  useEffect(() => {
    if (!isOpen || activeTab !== 'library') return;
    const t = setTimeout(fetchLibrary, searchQuery ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab, searchQuery]);

  const fetchLibrary = async () => {
    setLoading(true);
    try {
      const res = await listMediaAction({ search: searchQuery || undefined });
      if (res.success && res.data) {
        setFiles(res.data as MediaFile[]);
      } else {
        console.error('Failed to fetch media:', res.error);
      }
    } catch (err) {
      console.error('Error fetching media:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await uploadMediaFileAction(formData);
      
      if (res.success && res.data) {
        // Immediately select the returned file
        onSelect(res.data.url);
        onClose();
      } else {
        alert(res.error || "Upload failed");
      }
    } catch (err) {
      console.error('Upload error:', err);
      alert("An error occurred during upload.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm("Are you sure you want to delete this asset? It will be removed globally.")) return;

    try {
      const res = await deleteMediaAction(fileId);
      if (res.success) {
        setFiles(f => f.filter(x => x.id !== fileId));
        if (selectedFile?.id === fileId) setSelectedFile(null);
      } else {
        alert(res.error || 'Delete failed');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Delete failed');
    }
  };

  if (!isOpen) return null;

  const filteredFiles = files;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-5xl flex flex-col h-[85vh] sm:h-[80vh] overflow-hidden border border-gray-200 dark:border-gray-800">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-800 px-6">
          <button
            onClick={() => setActiveTab('library')}
            className={cn(
              "px-4 py-3 font-medium text-sm transition-colors border-b-2",
              activeTab === 'library'
                ? "border-brand text-brand"
                : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            )}
          >
            Media Library
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={cn(
              "px-4 py-3 font-medium text-sm transition-colors border-b-2",
              activeTab === 'upload'
                ? "border-brand text-brand"
                : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            )}
          >
            Upload New File
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">

          {activeTab === 'upload' ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl m-6 bg-gray-50 dark:bg-gray-800/50">
              <Upload className="w-12 h-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Drag and drop or click to upload</h3>
              <p className="text-sm text-gray-500 mb-6 max-w-sm text-center">SVG, PNG, JPG or GIF (max 20MB). Duplicate files will be safely skipped.</p>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-6 py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Uploading...' : 'Select File'}
              </button>
            </div>
          ) : (
            <>
              {/* Library Grid */}
              <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200 dark:border-gray-800">
                <div className="p-4 border-b border-gray-200 dark:border-gray-800">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search files..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-800 border-transparent focus:border-brand focus:ring-1 focus:ring-brand rounded-lg text-sm text-gray-900 dark:text-white outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {loading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : filteredFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                      <ImageIcon className="w-12 h-12 mb-3 opacity-20" />
                      <p>No media files found</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                      {filteredFiles.map(file => (
                        <div
                          key={file.id}
                          onClick={() => setSelectedFile(file)}
                          className={cn(
                            "group relative aspect-square rounded-lg border-2 overflow-hidden cursor-pointer bg-gray-100 dark:bg-gray-800",
                            selectedFile?.id === file.id ? "border-brand" : "border-transparent hover:border-brand/50"
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={file.url}
                            alt={file.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          {selectedFile?.id === file.id && (
                            <div className="absolute top-2 right-2 bg-white rounded-full text-brand shadow-sm">
                              <CheckCircle2 className="w-5 h-5" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar Detail */}
              <div className="w-72 bg-gray-50 dark:bg-gray-900/50 flex flex-col hidden sm:flex shrink-0">
                {selectedFile ? (
                  <div className="p-6 flex flex-col h-full">
                    <h3 className="font-bold text-gray-900 dark:text-white mb-4">Attachment Details</h3>

                    <div className="aspect-video bg-gray-200 dark:bg-gray-800 rounded-lg mb-4 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selectedFile.url} alt="Preview" className="w-full h-full object-contain" />
                    </div>

                    <div className="space-y-3 flex-1 overflow-y-auto min-h-0 text-sm">
                      <div>
                        <span className="block text-gray-500 mb-1">File name</span>
                        <span className="text-gray-900 dark:text-gray-200 break-all bg-gray-200 dark:bg-gray-800 px-2 py-1 rounded inline-block">{selectedFile.name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="block text-gray-500 mb-1">Size</span>
                          <span className="text-gray-900 dark:text-gray-200 font-medium">{selectedFile.size}</span>
                        </div>
                        <div>
                          <span className="block text-gray-500 mb-1">Uploaded</span>
                          <span className="text-gray-900 dark:text-gray-200 font-medium whitespace-nowrap">{new Date(selectedFile.uploadedAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                        <span className="block text-gray-500 mb-2">File URL</span>
                        <input type="text" readOnly value={selectedFile.url} className="w-full text-xs p-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-md focus:outline-none focus:ring-1 focus:ring-brand text-gray-600 dark:text-gray-400" />
                      </div>

                      <button
                        onClick={() => handleDelete(selectedFile.id)}
                        className="mt-6 flex items-center gap-2 text-red-600 hover:text-red-700 text-sm font-medium transition-colors"
                      >
                        <Trash2 className="w-4 h-4" /> Delete permanently
                      </button>
                    </div>

                    <div className="pt-4 border-t border-gray-200 dark:border-gray-800 mt-auto shrink-0">
                      <button
                        onClick={() => {
                          onSelect(selectedFile.url);
                          onClose();
                        }}
                        className="w-full py-2.5 bg-brand text-white font-medium rounded-lg hover:bg-brand/90 transition-colors disabled:opacity-50"
                      >
                        Select Image
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-sm text-gray-500 p-6 text-center">
                    Select a file to view its details
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

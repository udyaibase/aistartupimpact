'use client';

import { useState, useEffect } from 'react';
import { Image as ImageIcon, AlertCircle, CheckCircle, Edit3, Save, X } from 'lucide-react';
import { analyzeContentImages } from '../lib/seo-analyzer';
import { type ImageAnalysis } from '../lib/seo-types';

interface ImageAltTextManagerProps {
  content: string;
  focusKeyword: string;
  onUpdateImage: (oldSrc: string, newAltText: string) => void;
}

export default function ImageAltTextManager({
  content,
  focusKeyword,
  onUpdateImage,
}: ImageAltTextManagerProps) {
  const [images, setImages] = useState<ImageAnalysis[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const analyzed = analyzeContentImages(content, focusKeyword);
    setImages(analyzed);
  }, [content, focusKeyword]);

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setEditText(images[index].altText);
  };

  const handleSave = (index: number) => {
    const image = images[index];
    onUpdateImage(image.src, editText);
    setEditingIndex(null);
  };

  const handleCancel = () => {
    setEditingIndex(null);
    setEditText('');
  };

  const imagesWithoutAlt = images.filter(img => !img.hasAlt).length;
  const imagesWithPoorAlt = images.filter(img => img.hasAlt && !img.isOptimal).length;

  if (images.length === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <ImageIcon className="w-5 h-5 text-brand" />
          <div className="text-left">
            <h3 className="font-sora font-bold text-navy dark:text-white text-[15px]">
              Image Alt Text Manager
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-0.5">
              {images.length} {images.length === 1 ? 'image' : 'images'} found
              {imagesWithoutAlt > 0 && (
                <span className="text-red-500 font-semibold ml-1">
                  · {imagesWithoutAlt} missing alt text
                </span>
              )}
              {imagesWithPoorAlt > 0 && (
                <span className="text-yellow-600 dark:text-yellow-400 font-semibold ml-1">
                  · {imagesWithPoorAlt} need improvement
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {imagesWithoutAlt === 0 && imagesWithPoorAlt === 0 ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
          ) : (
            <AlertCircle className="w-5 h-5 text-yellow-500" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="p-6 space-y-4">
          {/* Info Banner */}
          <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <ImageIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-blue-900 dark:text-blue-300 font-jakarta mb-1">
                  Why Alt Text Matters
                </h4>
                <ul className="text-xs text-blue-700 dark:text-blue-400 font-jakarta space-y-1">
                  <li>• <strong>Accessibility:</strong> Screen readers use alt text for visually impaired users</li>
                  <li>• <strong>SEO:</strong> Search engines index alt text to understand image content</li>
                  <li>• <strong>Best Practice:</strong> 5-15 words, descriptive, include keywords naturally</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Images List */}
          <div className="space-y-3">
            {images.map((image, index) => (
              <div
                key={index}
                className={`p-4 rounded-xl border-2 ${
                  !image.hasAlt
                    ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10'
                    : !image.isOptimal
                    ? 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/10'
                    : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10'
                }`}
              >
                <div className="flex gap-4">
                  {/* Image Preview */}
                  <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0">
                    <img
                      src={image.src}
                      alt={image.altText || 'No alt text'}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EImage%3C/text%3E%3C/svg%3E';
                      }}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Status Badge */}
                    <div className="flex items-center gap-2 mb-2">
                      {!image.hasAlt ? (
                        <>
                          <AlertCircle className="w-4 h-4 text-red-500" />
                          <span className="text-xs font-bold text-red-700 dark:text-red-400 uppercase">
                            Missing Alt Text
                          </span>
                        </>
                      ) : !image.isOptimal ? (
                        <>
                          <AlertCircle className="w-4 h-4 text-yellow-500" />
                          <span className="text-xs font-bold text-yellow-700 dark:text-yellow-400 uppercase">
                            Needs Improvement
                          </span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="text-xs font-bold text-green-700 dark:text-green-400 uppercase">
                            Optimal
                          </span>
                        </>
                      )}
                      <span className="text-xs text-gray-400 font-jakarta">
                        ({image.altLength} words)
                      </span>
                    </div>

                    {/* Alt Text Editor */}
                    {editingIndex === index ? (
                      <div className="space-y-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          placeholder="Enter descriptive alt text (5-15 words)..."
                          className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand"
                          rows={2}
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSave(index)}
                            className="px-3 py-1.5 bg-brand hover:bg-brand/90 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                          >
                            <Save className="w-3 h-3" />
                            Save
                          </button>
                          <button
                            onClick={handleCancel}
                            className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                          >
                            <X className="w-3 h-3" />
                            Cancel
                          </button>
                          <span className="text-xs text-gray-400 font-jakarta ml-auto">
                            {editText.split(/\s+/).filter(w => w).length} words
                          </span>
                        </div>
                      </div>
                    ) : (
                      <>
                        {image.hasAlt ? (
                          <div className="mb-2">
                            <p className="text-sm text-gray-700 dark:text-gray-300 font-jakarta">
                              "{image.altText}"
                            </p>
                          </div>
                        ) : (
                          <div className="mb-2">
                            <p className="text-sm text-gray-400 italic font-jakarta">
                              No alt text set
                            </p>
                          </div>
                        )}
                        <button
                          onClick={() => handleEdit(index)}
                          className="text-xs text-brand hover:text-brand/80 font-semibold flex items-center gap-1 transition-colors"
                        >
                          <Edit3 className="w-3 h-3" />
                          {image.hasAlt ? 'Edit' : 'Add'} Alt Text
                        </button>
                      </>
                    )}

                    {/* Suggestions */}
                    {image.suggestions.length > 0 && editingIndex !== index && (
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1 font-jakarta">
                          Suggestions:
                        </p>
                        <ul className="space-y-1">
                          {image.suggestions.map((suggestion, idx) => (
                            <li key={idx} className="text-xs text-gray-600 dark:text-gray-400 font-jakarta flex items-start gap-1">
                              <span className="text-brand mt-0.5">•</span>
                              <span>{suggestion}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold font-sora text-navy dark:text-white">
                  {images.length}
                </div>
                <div className="text-[10px] text-gray-500 font-jakarta mt-0.5">Total Images</div>
              </div>
              <div>
                <div className={`text-2xl font-bold font-sora ${
                  imagesWithoutAlt > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                }`}>
                  {imagesWithoutAlt}
                </div>
                <div className="text-[10px] text-gray-500 font-jakarta mt-0.5">Missing Alt</div>
              </div>
              <div>
                <div className={`text-2xl font-bold font-sora ${
                  images.filter(img => img.isOptimal).length === images.length
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-yellow-600 dark:text-yellow-400'
                }`}>
                  {Math.round((images.filter(img => img.isOptimal).length / images.length) * 100)}%
                </div>
                <div className="text-[10px] text-gray-500 font-jakarta mt-0.5">Optimal</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

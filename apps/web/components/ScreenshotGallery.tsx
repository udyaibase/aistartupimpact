'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';

interface ScreenshotGalleryProps {
  screenshots: string[];
  toolName: string;
}

export default function ScreenshotGallery({ screenshots, toolName }: ScreenshotGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const scrollLeft = container.scrollLeft;
    const itemWidth = container.scrollWidth / screenshots.length;
    const index = Math.round(scrollLeft / itemWidth);

    setActiveIndex(index);
  };

  const scrollToIndex = (index: number) => {
    if (!scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const itemWidth = container.scrollWidth / screenshots.length;
    container.scrollTo({
      left: itemWidth * index,
      behavior: 'smooth'
    });
  };

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    setLightboxIndex(null);
    document.body.style.overflow = '';
  };

  const goTo = useCallback((dir: 'prev' | 'next') => {
    if (lightboxIndex === null) return;
    if (dir === 'prev') {
      setLightboxIndex(lightboxIndex <= 0 ? screenshots.length - 1 : lightboxIndex - 1);
    } else {
      setLightboxIndex(lightboxIndex >= screenshots.length - 1 ? 0 : lightboxIndex + 1);
    }
  }, [lightboxIndex, screenshots.length]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [screenshots.length]);

  useEffect(() => {
    if (lightboxIndex === null) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') goTo('prev');
      if (e.key === 'ArrowRight') goTo('next');
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxIndex, goTo]);

  return (
    <>
      <div className="card p-5 sm:p-6 overflow-hidden">
        <h2 className="section-title mb-4">Screenshots</h2>
        <div
          ref={scrollContainerRef}
          className="overflow-x-auto overflow-y-hidden scrollbar-hide -mx-5 sm:-mx-6 px-5 sm:px-6"
        >
          <div className="flex gap-4 pb-2 w-max">
            {screenshots.map((url: string, index: number) => (
              <button
                key={index}
                type="button"
                onClick={() => openLightbox(index)}
                className="group relative flex-shrink-0 w-[320px] sm:w-[400px] lg:w-[450px] aspect-video rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-brand transition-colors cursor-zoom-in"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`${toolName} screenshot ${index + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                  <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                </div>
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                  {index + 1} / {screenshots.length}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Pagination Dots */}
        <div className="flex items-center justify-center gap-2 mt-4">
          {screenshots.map((_, index) => (
            <button
              key={index}
              onClick={() => scrollToIndex(index)}
              className={`transition-all duration-300 rounded-full ${
                index === activeIndex
                  ? 'w-8 h-2 bg-brand'
                  : 'w-2 h-2 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
              }`}
              aria-label={`Go to screenshot ${index + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Lightbox Modal */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={closeLightbox}
        >
          {/* Close button */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Counter */}
          <div className="absolute top-4 left-4 z-10 text-white/70 text-sm font-medium">
            {lightboxIndex + 1} / {screenshots.length}
          </div>

          {/* Previous button */}
          {screenshots.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goTo('prev'); }}
              className="absolute left-2 sm:left-4 z-10 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="Previous screenshot"
            >
              <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          )}

          {/* Image */}
          <div
            className="max-w-[95vw] max-h-[90vh] sm:max-w-[90vw] sm:max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={screenshots[lightboxIndex]}
              alt={`${toolName} screenshot ${lightboxIndex + 1}`}
              className="max-w-full max-h-[90vh] sm:max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
          </div>

          {/* Next button */}
          {screenshots.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goTo('next'); }}
              className="absolute right-2 sm:right-4 z-10 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="Next screenshot"
            >
              <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          )}

          {/* Dots */}
          {screenshots.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
              {screenshots.map((_, index) => (
                <button
                  key={index}
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(index); }}
                  className={`rounded-full transition-all ${
                    index === lightboxIndex
                      ? 'w-8 h-2 bg-white'
                      : 'w-2 h-2 bg-white/40 hover:bg-white/60'
                  }`}
                  aria-label={`View screenshot ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

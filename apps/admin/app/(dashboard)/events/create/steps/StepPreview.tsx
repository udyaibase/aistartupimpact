"use client";

import {
  Calendar,
  MapPin,
  Video,
  Users,
  Tag,
  Clock,
  Globe,
} from "lucide-react";

interface EventTag {
  id: string;
  name: string;
  canonicalName: string;
  category: string | null;
}

interface Props {
  formData: any;
  tags: EventTag[];
}

export default function StepPreview({ formData, tags }: Props) {
  const selectedTags = tags.filter((t) => formData.tags.includes(t.id));
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-sora font-bold text-gray-900 dark:text-white">
          Preview
        </h2>
        <p className="mt-1 text-sm text-gray-500 font-jakarta">
          Review your event before publishing. Click &quot;Save Draft&quot; to save or &quot;Publish&quot; to go live.
        </p>
      </div>

      {/* Preview Card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Cover */}
        {formData.coverImageUrl ? (
          <img
            src={formData.coverImageUrl}
            alt="Cover"
            className="w-full h-56 object-cover"
          />
        ) : (
          <div className="w-full h-56 bg-gradient-to-br from-brand/10 to-brand/5 flex items-center justify-center">
            <span className="text-gray-400 text-sm font-jakarta">No cover image</span>
          </div>
        )}

        <div className="p-6 space-y-4">
          {/* Category Badge */}
          <div className="flex items-center gap-2">
            <span className="badge-category">{formData.category.replace("_", " ")}</span>
            <span className="badge-category">{formData.format.replace("_", " ")}</span>
            {formData.visibility !== "PUBLIC" && (
              <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">
                {formData.visibility}
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="portal-title">
            {formData.title || "Untitled Event"}
          </h1>
          {formData.subtitle && (
            <p className="text-gray-500 font-jakarta">{formData.subtitle}</p>
          )}

          {/* Meta Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-3 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="font-jakarta">{formatDate(formData.startAt)}</span>
            </div>
            {formData.endAt && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="font-jakarta">Ends: {formatDate(formData.endAt)}</span>
              </div>
            )}
            {formData.venueName && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span className="font-jakarta">{formData.venueName}</span>
              </div>
            )}
            {formData.meetingLink && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <Video className="w-4 h-4 text-gray-400" />
                <span className="font-jakarta">Virtual meeting link set</span>
              </div>
            )}
            {formData.capacity && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="font-jakarta">Capacity: {formData.capacity}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <Globe className="w-4 h-4 text-gray-400" />
              <span className="font-jakarta">{formData.timezone}</span>
            </div>
          </div>

          {/* Description */}
          {formData.description && (
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-sora mb-2">
                About
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 font-jakarta whitespace-pre-wrap">
                {typeof formData.description === "string"
                  ? formData.description
                  : JSON.stringify(formData.description)}
              </p>
            </div>
          )}

          {/* Speakers */}
          {formData.speakers.length > 0 && (
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-sora mb-3">
                Speakers ({formData.speakers.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {formData.speakers.map((s: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl"
                  >
                    <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center">
                      <span className="text-brand font-bold text-sm">
                        {s.name?.charAt(0) || "?"}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200 font-jakarta">
                        {s.name}
                      </p>
                      <p className="text-xs text-gray-400 font-jakarta">
                        {[s.title, s.company].filter(Boolean).join(", ") || "Speaker"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Agenda */}
          {formData.agendaItems.length > 0 && (
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 font-sora mb-3">
                Schedule ({formData.agendaItems.length} sessions)
              </h3>
              <div className="space-y-2">
                {formData.agendaItems.map((item: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <span className="text-xs font-mono text-gray-400 mt-0.5 min-w-[90px]">
                      {item.startTime} – {item.endTime}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200 font-jakarta">
                        {item.title}
                      </p>
                      {item.description && (
                        <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {selectedTags.length > 0 && (
            <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2 flex-wrap">
              <Tag className="w-3.5 h-3.5 text-gray-400" />
              {selectedTags.map((tag) => (
                <span
                  key={tag.id}
                  className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300 rounded-full font-jakarta"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          {/* URL */}
          <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-400 font-jakarta">
              Public URL: <span className="text-brand">/events/{formData.slug || "..."}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

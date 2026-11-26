"use client";

import { useState, useRef } from "react";
import { Plus, X, Upload, User, GripVertical } from "lucide-react";
import { uploadEventImageAction } from "../../actions";
import { notify } from '@/components/Toast';

interface Props {
  formData: any;
  updateFormData: (updates: any) => void;
}

export default function StepDetails({ formData, updateFormData }: Props) {
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // ─── Cover Image Upload ───
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setUploadingCover(true);
    try {
      const fd = new FormData();
      fd.append("file", e.target.files[0]);
      const result = await uploadEventImageAction(fd);
      if (result.success && result.data?.url) {
        updateFormData({ coverImageUrl: result.data.url });
      }
    } catch (err) {
      console.error("Cover upload error:", err);
      notify("Couldn't load this. Check your connection and refresh.", 'error');
    } finally {
      setUploadingCover(false);
      e.target.value = "";
    }
  };

  // ─── Speakers ───
  const addSpeaker = () => {
    updateFormData({
      speakers: [
        ...formData.speakers,
        { name: "", title: "", company: "", headshotUrl: "", bio: "", talkTitle: "" },
      ],
    });
  };

  const updateSpeaker = (index: number, field: string, value: string) => {
    const updated = [...formData.speakers];
    updated[index] = { ...updated[index], [field]: value };
    updateFormData({ speakers: updated });
  };

  const removeSpeaker = (index: number) => {
    updateFormData({
      speakers: formData.speakers.filter((_: any, i: number) => i !== index),
    });
  };

  // ─── Agenda Items ───
  const addAgendaItem = () => {
    updateFormData({
      agendaItems: [
        ...formData.agendaItems,
        { dayNumber: 1, startTime: "09:00", endTime: "10:00", title: "", description: "" },
      ],
    });
  };

  const updateAgendaItem = (index: number, field: string, value: any) => {
    const updated = [...formData.agendaItems];
    updated[index] = { ...updated[index], [field]: value };
    updateFormData({ agendaItems: updated });
  };

  const removeAgendaItem = (index: number) => {
    updateFormData({
      agendaItems: formData.agendaItems.filter((_: any, i: number) => i !== index),
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-sora font-bold text-gray-900 dark:text-white">
          Event Details
        </h2>
        <p className="mt-1 text-sm text-gray-500 font-jakarta">
          Add description, cover image, speakers, and agenda.
        </p>
      </div>

      {/* Cover Image */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5 font-jakarta">
          Cover Image
        </label>
        {formData.coverImageUrl ? (
          <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
            <img
              src={formData.coverImageUrl}
              alt="Cover"
              className="w-full h-48 object-cover"
            />
            <button
              onClick={() => updateFormData({ coverImageUrl: "" })}
              className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full text-white hover:bg-black/80"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => coverInputRef.current?.click()}
            disabled={uploadingCover}
            className="w-full h-48 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-brand/40 hover:text-brand transition-colors"
          >
            <Upload className="w-6 h-6" />
            <span className="text-sm font-jakarta">
              {uploadingCover ? "Uploading..." : "Click to upload cover image"}
            </span>
          </button>
        )}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          onChange={handleCoverUpload}
          className="hidden"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5 font-jakarta">
          Description
        </label>
        <textarea
          value={typeof formData.description === "string" ? formData.description : ""}
          onChange={(e) => updateFormData({ description: e.target.value })}
          rows={8}
          placeholder="Describe your event — what attendees will learn, who it's for, why they should attend..."
          className="input-field resize-y min-h-[200px]"
        />
        <p className="mt-1 text-xs text-gray-400 font-jakarta">
          Rich text editor will be available in a future update. For now, use plain text or markdown.
        </p>
      </div>

      {/* ─── Speakers ─── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-semibold text-gray-500 uppercase font-jakarta">
            Speakers
          </label>
          <button
            onClick={addSpeaker}
            className="flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-600 font-jakarta"
          >
            <Plus className="w-3.5 h-3.5" /> Add Speaker
          </button>
        </div>

        {formData.speakers.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <User className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400 font-jakarta">
              No speakers added yet
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {formData.speakers.map((speaker: any, i: number) => (
              <div
                key={i}
                className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-gray-300" />
                    <span className="text-xs font-semibold text-gray-400 font-jakarta">
                      Speaker {i + 1}
                    </span>
                  </div>
                  <button
                    onClick={() => removeSpeaker(i)}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={speaker.name}
                    onChange={(e) => updateSpeaker(i, "name", e.target.value)}
                    placeholder="Full Name *"
                    className="input-field"
                  />
                  <input
                    type="text"
                    value={speaker.title}
                    onChange={(e) => updateSpeaker(i, "title", e.target.value)}
                    placeholder="Title (e.g. CTO)"
                    className="input-field"
                  />
                  <input
                    type="text"
                    value={speaker.company}
                    onChange={(e) => updateSpeaker(i, "company", e.target.value)}
                    placeholder="Company"
                    className="input-field"
                  />
                  <input
                    type="text"
                    value={speaker.talkTitle}
                    onChange={(e) => updateSpeaker(i, "talkTitle", e.target.value)}
                    placeholder="Talk Title"
                    className="input-field"
                  />
                </div>
                <textarea
                  value={speaker.bio}
                  onChange={(e) => updateSpeaker(i, "bio", e.target.value)}
                  placeholder="Short bio (optional)"
                  rows={2}
                  className="input-field mt-3 resize-none"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Agenda ─── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-semibold text-gray-500 uppercase font-jakarta">
            Agenda / Schedule
          </label>
          <button
            onClick={addAgendaItem}
            className="flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-600 font-jakarta"
          >
            <Plus className="w-3.5 h-3.5" /> Add Session
          </button>
        </div>

        {formData.agendaItems.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
            <p className="text-sm text-gray-400 font-jakarta">
              No agenda items yet. Add sessions to build your schedule.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {formData.agendaItems.map((item: any, i: number) => (
              <div
                key={i}
                className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-xs font-semibold text-gray-400 font-jakarta">
                    Session {i + 1}
                  </span>
                  <button
                    onClick={() => removeAgendaItem(i)}
                    className="p-1 text-gray-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1 font-jakarta">
                      Day
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={item.dayNumber}
                      onChange={(e) =>
                        updateAgendaItem(i, "dayNumber", parseInt(e.target.value) || 1)
                      }
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1 font-jakarta">
                      Start
                    </label>
                    <input
                      type="time"
                      value={item.startTime}
                      onChange={(e) => updateAgendaItem(i, "startTime", e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1 font-jakarta">
                      End
                    </label>
                    <input
                      type="time"
                      value={item.endTime}
                      onChange={(e) => updateAgendaItem(i, "endTime", e.target.value)}
                      className="input-field"
                    />
                  </div>
                </div>
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => updateAgendaItem(i, "title", e.target.value)}
                  placeholder="Session title *"
                  className="input-field mb-2"
                />
                <input
                  type="text"
                  value={item.description || ""}
                  onChange={(e) => updateAgendaItem(i, "description", e.target.value)}
                  placeholder="Brief description (optional)"
                  className="input-field"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import OrganizerEventForm from "../create/OrganizerEventForm";

export default function EditEventPage(props: { params: Promise<{ eventId: string }> }) {
  const params = use(props.params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [event, setEvent] = useState<any>(null);
  const [organizerId, setOrganizerId] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/organizer/events/${params.eventId}`).then(r => r.json()),
      fetch("/api/organizer/auth/session").then(r => r.json()),
    ])
      .then(([eventData, sessionData]) => {
        if (eventData.success && eventData.event) {
          setEvent(eventData.event);
        } else {
          setError("Event not found or unauthorized.");
        }
        if (sessionData.id) {
          setOrganizerId(sessionData.id);
        }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load event."); setLoading(false); });
  }, [params.eventId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center">
        <p className="text-sm text-red-500 font-jakarta">{error || "Event not found."}</p>
        <Link href="/organizer/events" className="text-sm text-brand hover:underline mt-4 inline-block">
          ← Back to events
        </Link>
      </div>
    );
  }

  return <OrganizerEventForm organizerId={organizerId || event.organizerId} event={event} />;
}

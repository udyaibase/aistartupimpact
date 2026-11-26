"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@udyaibase/database";
import { sectionRoles } from '@/lib/section-access';

const EVENT_ROLES = sectionRoles('/events');

/**
 * Check in an attendee by QR token, email, or name.
 * Returns success/failure with a user-friendly message.
 */
export async function checkInAttendeeAction(
  eventId: string,
  input: string
): Promise<{ success: boolean; message: string }> {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !EVENT_ROLES.includes(session.user.role)) {
    return { success: false, message: "Unauthorized" };
  }

  try {
    // Try to find registration by QR token first (fastest, most reliable)
    let registration = await prisma.eventRegistration.findFirst({
      where: {
        eventId,
        qrToken: input,
        deletedAt: null,
      },
      select: { id: true, status: true, guestName: true, guestEmail: true, checkedInAt: true },
    });

    // If not found by token, try email
    if (!registration) {
      registration = await prisma.eventRegistration.findFirst({
        where: {
          eventId,
          guestEmail: { equals: input, mode: "insensitive" },
          deletedAt: null,
        },
        select: { id: true, status: true, guestName: true, guestEmail: true, checkedInAt: true },
      });
    }

    // If not found by email, try name (partial match)
    if (!registration) {
      registration = await prisma.eventRegistration.findFirst({
        where: {
          eventId,
          guestName: { contains: input, mode: "insensitive" },
          deletedAt: null,
        },
        select: { id: true, status: true, guestName: true, guestEmail: true, checkedInAt: true },
      });
    }

    if (!registration) {
      return { success: false, message: `No registration found for "${input}"` };
    }

    // Already checked in
    if (registration.status === "CHECKED_IN") {
      return {
        success: false,
        message: `${registration.guestName} is already checked in (${registration.checkedInAt ? new Date(registration.checkedInAt).toLocaleTimeString() : ""})`,
      };
    }

    // Not in a valid status for check-in
    if (registration.status === "CANCELLED") {
      return { success: false, message: `${registration.guestName}'s registration was cancelled` };
    }

    if (registration.status === "WAITLISTED") {
      return { success: false, message: `${registration.guestName} is on the waitlist (not confirmed)` };
    }

    // Check in!
    await prisma.eventRegistration.update({
      where: { id: registration.id },
      data: {
        status: "CHECKED_IN",
        checkedInAt: new Date(),
      },
    });

    return {
      success: true,
      message: `✓ ${registration.guestName} checked in successfully!`,
    };
  } catch (error: any) {
    console.error("Check-in error:", error);
    return { success: false, message: "Check-in failed. Please try again." };
  }
}

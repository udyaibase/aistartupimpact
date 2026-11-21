import { z } from 'zod';

// Auth validation schemas
export const signupSchema = z.object({
  email: z.string().email('Invalid email address').max(255, 'Email too long'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password too long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
  password: z.string().min(1, 'Password required').max(100),
});

export const emailSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
});

// Review validation schemas
export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().min(5, 'Title must be at least 5 characters').max(50, 'Title too long'),
  body: z.string().min(1, 'Review details required').max(200, 'Review too long'),
  proofImageUrl: z.string().url().optional().or(z.literal('')),
});

// Profile validation schemas
export const profileUpdateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  bio: z.string().max(500).optional(),
  twitter: z.string().max(100).optional(),
  linkedin: z.string().max(100).optional(),
  website: z.string().url().max(255).optional().or(z.literal('')),
});

// Newsletter validation
export const newsletterSchema = z.object({
  email: z.string().email('Invalid email address').max(255),
  name: z.string().min(2).max(100).optional(),
  source: z.string().max(50).optional(),
});

// Comment validation
export const commentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  body: z.string().min(5, 'Comment must be at least 5 characters').max(1000, 'Comment too long'),
});

// Startup submission validation
export const startupSubmissionSchema = z.object({
  name: z.string().min(2).max(100),
  tagline: z.string().min(10).max(200),
  description: z.string().min(50).max(2000),
  websiteUrl: z.string().url().max(255),
  logoUrl: z.string().url().max(255).optional(),
  category: z.string().min(2).max(50),
  stage: z.enum(['IDEA', 'MVP', 'EARLY', 'GROWTH', 'SCALE']),
  founderEmail: z.string().email().max(255),
});

// Tool submission validation
export const toolSubmissionSchema = z.object({
  name: z.string().min(2).max(100),
  tagline: z.string().min(10).max(200),
  description: z.string().min(50).max(2000),
  websiteUrl: z.string().url().max(255),
  logoUrl: z.string().url().max(255).optional(),
  pricingModel: z.enum(['FREE', 'FREEMIUM', 'PAID', 'SUBSCRIPTION']),
});

// Change password validation
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(100),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password too long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

// Change email validation
export const changeEmailSchema = z.object({
  newEmail: z.string().email('Invalid email address').max(255),
  password: z.string().min(1, 'Password is required').max(100),
});

// Delete account validation
export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Password is required').max(100),
  confirmation: z.string().optional(),
});

// Support ticket validation
export const supportTicketSchema = z.object({
  subject: z.string().min(3, 'Subject must be at least 3 characters').max(200, 'Subject too long'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(5000, 'Description too long'),
  category: z.string().min(1).max(50).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
});

// Support ticket message validation
export const supportMessageSchema = z.object({
  content: z.string().min(1, 'Message is required').max(5000, 'Message too long'),
});

// Strip HTML tags from plain text inputs to prevent XSS
export function sanitizeText(input: string): string {
  let result = input;
  let prev: string;
  do {
    prev = result;
    result = result.replace(/<[^>]*>/g, '');
  } while (result !== prev);
  return result.trim();
}

// Helper function to validate and sanitize input
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      // zod 4 lists problems as `issues` (zod 3 called them `errors`).
      const firstError = error.issues[0];
      return { success: false, error: firstError?.message || 'Invalid input' };
    }
    return { success: false, error: 'Invalid input' };
  }
}

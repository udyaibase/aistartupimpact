import { DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { r2 } from '@/lib/media';

/**
 * Resumes sent with applications to roles at Udyaibase. The website stores them in the private resumes bucket
 * (R2_RESUMES_BUCKET) and saves a reference like "private:careers/<id>.pdf" on the application; only signed-in
 * staff can read them, through /api/admin/applications/[id]/resume.
 */
const REF = /^private:(careers\/[0-9a-f-]{36}\.pdf)$/;

export function careersResumeKey(ref: string | null | undefined): string | null {
  return ref?.match(REF)?.[1] ?? null;
}

const bucket = () => {
  const b = process.env.R2_RESUMES_BUCKET;
  if (!b) throw new Error('R2_RESUMES_BUCKET is not set');
  return b;
};

export async function readCareersResume(key: string): Promise<Uint8Array> {
  const res = await r2.send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return new Uint8Array(await res.Body!.transformToByteArray());
}

export async function deleteCareersResume(key: string): Promise<void> {
  await r2.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

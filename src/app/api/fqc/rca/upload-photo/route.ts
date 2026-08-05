import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/supabase-admin';
import { authenticateRequest } from '@/lib/auth';

const BUCKET_NAME = 'rca-photos';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB raw limit
const MAX_DIMENSION = 800;
const JPEG_QUALITY = 0.65;

/**
 * Ensure the rca-photos bucket exists and is public.
 */
async function ensureBucket() {
  try {
    const { data: buckets } = await adminClient.storage.listBuckets();
    const exists = buckets?.some((b: { name: string }) => b.name === BUCKET_NAME);
    if (!exists) {
      await adminClient.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 2 * 1024 * 1024, // 2MB per file after compression
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      });
    }
  } catch (e) {
    console.error('Ensure bucket error:', e);
  }
}

/**
 * Compress image using sharp (server-side).
 * Falls back to storing the original if sharp is not available.
 */
async function compressImage(buffer: Buffer, mimeType: string): Promise<{ data: Buffer; contentType: string }> {
  try {
    // Dynamic import to avoid bundling issues
    const sharp = (await import('sharp')).default;
    let image = sharp(buffer);
    const metadata = await image.metadata();

    // Resize if wider than MAX_DIMENSION
    if (metadata.width && metadata.width > MAX_DIMENSION) {
      image = image.resize(MAX_DIMENSION, null, { withoutEnlargement: true });
    }

    const output = await image
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    return { data: output, contentType: 'image/jpeg' };
  } catch {
    // sharp not available — return original (client should have compressed already)
    return { data: buffer, contentType: mimeType };
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, 'full');
  if (auth.error) return auth.error;

  try {
    await ensureBucket();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const prefix = (formData.get('prefix') as string) || 'rca';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 5MB)' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files allowed' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Compress server-side
    const { data: compressed, contentType } = await compressImage(buffer, file.type);

    // Generate unique path: prefix/YYYY/MM/timestamp_random.jpg
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 8);
    const ext = contentType === 'image/png' ? 'png' : 'jpg';
    const filePath = `${prefix}/${y}/${m}/${ts}_${rand}.${ext}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await adminClient.storage
      .from(BUCKET_NAME)
      .upload(filePath, compressed, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = adminClient.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    return NextResponse.json({
      url: urlData.publicUrl,
      path: filePath,
      size: compressed.length,
    });
  } catch (error) {
    console.error('Photo upload error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';

// Temporary diagnostic route -- reports whether GOOGLE_VISION_API_KEY is
// configured in this deployment's environment, without ever exposing the
// key value itself. Safe to hit directly. Delete this file once done
// debugging.
export async function GET() {
  const key = process.env.GOOGLE_VISION_API_KEY;
  return NextResponse.json({
    hasKey: !!key,
    keyLength: key ? key.length : 0,
  });
}

import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();

    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: image },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          }],
        }),
      }
    );

    const data = await res.json();
    const text: string = data.responses?.[0]?.fullTextAnnotation?.text ?? '';

    const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
    const numbers = lines
      .flatMap((l: string) => l.match(/[\d,]+(\.\d{1,2})?/g) ?? [])
      .map((n: string) => parseFloat(n.replace(/,/g, '')))
      .filter((n: number) => !isNaN(n));

    const total = numbers.length ? Math.max(...numbers) : 0;
    const items = lines.filter((l: string) => !/^\d/.test(l)).slice(0, 8);

    return NextResponse.json({ total, items });
  } catch (err) {
    return NextResponse.json({ error: 'OCR failed' }, { status: 500 });
  }
}

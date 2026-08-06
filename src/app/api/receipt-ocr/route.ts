import { NextRequest, NextResponse } from 'next/server';

interface ParsedItem {
  item_name: string;
  quantity: number;
  unit_price: number;
}

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();

    console.log('=== BASE64 IMAGE LENGTH ===');
    console.log(image.length);
    console.log('=== END BASE64 IMAGE LENGTH ===');

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

    console.log('=== VISION API STATUS CODE ===');
    console.log(res.status);
    console.log('=== END VISION API STATUS CODE ===');

    const data = await res.json();

    console.log('=== FULL VISION API RESPONSE ===');
    console.log(JSON.stringify(data, null, 2));
    console.log('=== END FULL VISION API RESPONSE ===');

    const text: string = data.responses?.[0]?.fullTextAnnotation?.text ?? '';

    console.log('=== RAW OCR TEXT ===');
    console.log(text);
    console.log('=== END RAW OCR TEXT ===');

    const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
    
    // Parse each line to extract item, quantity, and unit price
    const parsedItems: ParsedItem[] = [];
    const rawLines: string[] = [];

    for (const line of lines) {
      // Try to extract trailing price (number at end of line)
      const priceMatch = line.match(/([\d,]+\.?\d*)\s*$/);
      let unitPrice = 0;
      let itemName = line;
      
      if (priceMatch) {
        unitPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
        itemName = line.replace(priceMatch[0], '').trim();
      }

      // Try to extract quantity (patterns like "x2", "2x", or leading count)
      let quantity = 1;
      const qtyMatch = itemName.match(/(\d+)\s*[xх]|[xх]\s*(\d+)/i);
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1] || qtyMatch[2]);
        itemName = itemName.replace(qtyMatch[0], '').trim();
      } else {
        // Check if line starts with a number (e.g., "2 Milk")
        const leadingNumMatch = itemName.match(/^(\d+)\s+(.+)/);
        if (leadingNumMatch) {
          quantity = parseInt(leadingNumMatch[1]);
          itemName = leadingNumMatch[2];
        }
      }

      // Only add if we have a valid item name and either price or quantity > 1
      if (itemName && (unitPrice > 0 || quantity > 1)) {
        parsedItems.push({
          item_name: itemName,
          quantity: quantity,
          unit_price: unitPrice
        });
      } else if (itemName) {
        // Add to raw lines for manual review if couldn't parse
        rawLines.push(line);
      }
    }

    // Calculate total from parsed items
    const total = parsedItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

    console.log('=== PARSED ITEMS ===');
    console.log(JSON.stringify(parsedItems, null, 2));
    console.log('=== END PARSED ITEMS ===');

    return NextResponse.json({ 
      total, 
      items: parsedItems,
      raw_lines: rawLines 
    });
  } catch (err) {
    return NextResponse.json({ error: 'OCR failed' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createServiceRoleClient } from '@/utils/supabase/service-role';

interface ParsedItem {
  item_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
}

// Uzbek Cyrillic-to-Latin transliteration mapping (official standard)
const CYRILLIC_TO_LATIN_MAP: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'ғ': "g'",
  'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z',
  'и': 'i', 'й': 'y', 'к': 'k', 'қ': 'q', 'л': 'l',
  'м': 'm', 'н': 'n', 'о': 'o', 'ў': "o'", 'п': 'p',
  'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f',
  'х': 'x', 'ҳ': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh',
  'щ': 'shch', 'ъ': "'", 'ь': "'", 'э': 'e', 'ю': 'yu', 'я': 'ya',
  // Uppercase variants
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Ғ': "G'",
  'Д': 'D', 'Е': 'E', 'Ё': 'Yo', 'Ж': 'J', 'З': 'Z',
  'И': 'I', 'Й': 'Y', 'К': 'K', 'Қ': 'Q', 'Л': 'L',
  'М': 'M', 'Н': 'N', 'О': 'O', 'Ў': "O'", 'П': 'P',
  'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F',
  'Х': 'X', 'Ҳ': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh',
  'Щ': 'Shch', 'Ъ': "'", 'Ь': "'", 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
};

function transliterateUzbek(text: string): string {
  return text.split('').map(char => CYRILLIC_TO_LATIN_MAP[char] || char).join('');
}

// Uzbek unit normalization mapping (Cyrillic to Latin script)
const UNIT_NORMALIZATION_MAP: Record<string, string> = {
  'кг': 'kg',
  'г': 'gramm',
  'д.': 'dona',
  'дона': 'dona',
  'л': 'litr',
  'мл': 'ml',
  'шт': 'dona',
};

function normalizeUnit(unit: string): string {
  const normalized = unit.trim().toLowerCase();
  return UNIT_NORMALIZATION_MAP[normalized] || unit;
}

async function getApiKeyFromVault(supabase: any, teamId: string, keyName: string): Promise<string | null> {
  const adminClient = createServiceRoleClient();
  const { data: vaultKey, error: vaultError } = await adminClient.rpc('get_team_api_key', {
    p_team_id: teamId,
    p_key_name: keyName,
  });
  if (!vaultError && vaultKey) return vaultKey;
  return null;
}

async function callGoogleVision(image: string, apiKey: string): Promise<string> {
  console.log('=== OCR PROVIDER: Google Vision ===');
  const res = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
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

  if (!res.ok) {
    throw new Error(`Google Vision failed: ${res.status}`);
  }

  return data.responses?.[0]?.fullTextAnnotation?.text ?? '';
}

async function callOCRSpace(image: string, apiKey: string): Promise<string> {
  console.log('=== OCR PROVIDER: OCR.space ===');
  const formData = new FormData();
  formData.append('base64Image', `data:image/jpeg;base64,${image}`);
  formData.append('apiKey', apiKey);
  formData.append('OCREngine', '2');
  formData.append('isTable', 'true');

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body: formData,
  });

  console.log('=== OCR.SPACE API STATUS CODE ===');
  console.log(res.status);
  console.log('=== END OCR.SPACE API STATUS CODE ===');

  const data = await res.json();

  console.log('=== FULL OCR.SPACE API RESPONSE ===');
  console.log(JSON.stringify(data, null, 2));
  console.log('=== END FULL OCR.SPACE API RESPONSE ===');

  if (!res.ok || data.IsErroredOnProcessing) {
    throw new Error(`OCR.space failed: ${data.ErrorMessage || res.status}`);
  }

  return data.ParsedResults?.[0]?.ParsedText ?? '';
}

interface GroqParsedResponse {
  items: Array<{ name: string; quantity: number; unit: string; price: number }>;
  total: number;
  currency: string;
}

async function callGroqVision(image: string, apiKey: string): Promise<{ items: ParsedItem[]; total: number } | null> {
  console.log('=== OCR PROVIDER: Groq Vision (qwen/qwen3.6-27b) ===');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'qwen/qwen3.6-27b',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract purchased items from this Uzbek receipt image. Return ONLY valid JSON in this exact shape: { "items": [{ "name": string, "quantity": number, "unit": string, "price": number }], "total": number, "currency": string }. Include the unit as printed on the receipt (кг, г, д., л, мл, шт, etc.) - do not normalize. Ignore tax breakdown sub-lines (e.g. containing QQS/ҚҚС) - those are not separate items. The total should come from the line marked ЖАМИ or similar. Transliterate any Cyrillic text in item names to Latin script.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${image}`,
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  console.log('=== GROQ VISION API STATUS CODE ===');
  console.log(res.status);
  console.log('=== END GROQ VISION API STATUS CODE ===');

  const data = await res.json();

  console.log('=== FULL GROQ VISION API RESPONSE ===');
  console.log(JSON.stringify(data, null, 2));
  console.log('=== END FULL GROQ VISION API RESPONSE ===');

  if (!res.ok) {
    throw new Error(`Groq Vision failed: ${res.status}`);
  }

  try {
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.log('Groq Vision returned no content');
      return null;
    }

    const parsed: GroqParsedResponse = JSON.parse(content);
    
    // Convert Groq format to ParsedItem format with unit normalization
    const items: ParsedItem[] = parsed.items.map(item => ({
      item_name: item.name,
      quantity: item.quantity,
      unit: normalizeUnit(item.unit || ''),
      unit_price: item.price,
    }));

    console.log('=== GROQ VISION PARSED ITEMS ===');
    console.log(JSON.stringify(items, null, 2));
    console.log('=== END GROQ VISION PARSED ITEMS ===');

    return { items, total: parsed.total };
  } catch (error) {
    console.log('Failed to parse Groq Vision response as JSON:', error);
    return null;
  }
}

async function callGroqParsing(text: string, apiKey: string): Promise<{ items: ParsedItem[]; total: number } | null> {
  console.log('=== PARSING METHOD: Groq ===');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'user',
          content: `Extract purchased items from this Uzbek receipt OCR text. Return ONLY valid JSON in this exact shape: { "items": [{ "name": string, "quantity": number, "price": number }], "total": number, "currency": string }. Ignore tax breakdown sub-lines (e.g. containing QQS/ҚҚС) - those are not separate items. The quantity and price for each item may appear on the same line as the name or on a following line - match them correctly per item. The total should come from the line marked ЖАМИ (or similar 'total' label on the receipt), not a sum you calculate yourself. If a field can't be determined, omit that item rather than guessing. Receipt text: ${text}`,
        },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  console.log('=== GROQ API STATUS CODE ===');
  console.log(res.status);
  console.log('=== END GROQ API STATUS CODE ===');

  const data = await res.json();

  console.log('=== FULL GROQ API RESPONSE ===');
  console.log(JSON.stringify(data, null, 2));
  console.log('=== END FULL GROQ API RESPONSE ===');

  if (!res.ok) {
    throw new Error(`Groq failed: ${res.status}`);
  }

  try {
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.log('Groq returned no content');
      return null;
    }

    const parsed: GroqParsedResponse = JSON.parse(content);
    
    // Convert Groq format to ParsedItem format with unit normalization
    const items: ParsedItem[] = parsed.items.map(item => ({
      item_name: item.name,
      quantity: item.quantity,
      unit: normalizeUnit(item.unit || ''),
      unit_price: item.price,
    }));

    console.log('=== GROQ PARSED ITEMS ===');
    console.log(JSON.stringify(items, null, 2));
    console.log('=== END GROQ PARSED ITEMS ===');

    return { items, total: parsed.total };
  } catch (error) {
    console.log('Failed to parse Groq response as JSON:', error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    const url = new URL(req.url);
    const testProvider = url.searchParams.get('provider');

    console.log('=== BASE64 IMAGE LENGTH ===');
    console.log(image.length);
    console.log('=== END BASE64 IMAGE LENGTH ===');

    let teamId: string | null = null;
    let provider: string = 'none';

    try {
      const supabase = await createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('team_id, id')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          teamId = profile.team_id || profile.id;
        }
      }
    } catch (error) {
      console.error('Error fetching team info:', error);
    }

    // Test path: Groq Vision only (skip OCR providers entirely)
    if (testProvider === 'groq_vision') {
      try {
        let groqKey = process.env.GROQ_API_KEY;
        if (teamId) {
          const vaultKey = await getApiKeyFromVault(null, teamId, 'groq');
          if (vaultKey) groqKey = vaultKey;
        }

        if (!groqKey) {
          return NextResponse.json({ error: 'Groq API key not configured for vision test' }, { status: 500 });
        }

        const groqResult = await callGroqVision(image, groqKey);
        if (!groqResult) {
          return NextResponse.json({ error: 'Groq Vision failed to parse' }, { status: 500 });
        }

        console.log('=== OCR SERVED BY: groq_vision ===');
        console.log('=== PARSING SERVED BY: groq_vision ===');

        return NextResponse.json({
          total: groqResult.total,
          items: groqResult.items,
          raw_lines: [],
          provider: 'groq_vision',
          parsing_method: 'groq_vision',
        });
      } catch (error) {
        console.error('Groq Vision test failed:', error);
        return NextResponse.json({ error: 'Groq Vision test failed' }, { status: 500 });
      }
    }

    // Try Google Vision first
    let text = '';
    try {
      let googleKey = process.env.GOOGLE_VISION_API_KEY;
      if (teamId) {
        const vaultKey = await getApiKeyFromVault(null, teamId, 'google_vision');
        if (vaultKey) googleKey = vaultKey;
      }

      if (googleKey) {
        text = await callGoogleVision(image, googleKey);
        provider = 'google_vision';
      }
    } catch (error) {
      console.log('Google Vision failed, falling back to OCR.space:', error);
    }

    // Fall back to OCR.space if Google Vision failed or no key
    if (!text) {
      try {
        let ocrSpaceKey = process.env.OCR_SPACE_API_KEY;
        if (teamId) {
          const vaultKey = await getApiKeyFromVault(null, teamId, 'ocr_space');
          if (vaultKey) ocrSpaceKey = vaultKey;
        }

        if (ocrSpaceKey) {
          text = await callOCRSpace(image, ocrSpaceKey);
          provider = 'ocr_space';
        }
      } catch (error) {
        console.log('OCR.space failed:', error);
      }
    }

    if (!text) {
      return NextResponse.json({ error: 'No OCR provider available or all providers failed' }, { status: 500 });
    }

    console.log(`=== OCR SERVED BY: ${provider} ===`);

    // Transliterate Cyrillic to Latin script (applies to both providers)
    const transliteratedText = transliterateUzbek(text);

    console.log('=== RAW OCR TEXT ===');
    console.log(transliteratedText);
    console.log('=== END RAW OCR TEXT ===');

    // Try Groq parsing first if key is available
    let parsedItems: ParsedItem[] = [];
    let total = 0;
    let parsingMethod = 'regex';
    let rawLines: string[] = [];

    try {
      let groqKey = process.env.GROQ_API_KEY;
      if (teamId) {
        const vaultKey = await getApiKeyFromVault(null, teamId, 'groq');
        if (vaultKey) groqKey = vaultKey;
      }

      if (groqKey) {
        const groqResult = await callGroqParsing(transliteratedText, groqKey);
        if (groqResult && groqResult.items.length > 0) {
          parsedItems = groqResult.items;
          total = groqResult.total;
          parsingMethod = 'groq';
        }
      }
    } catch (error) {
      console.log('Groq parsing failed, falling back to regex:', error);
    }

    // Fall back to regex parser if Groq failed or returned no items
    if (parsedItems.length === 0) {
      const lines = transliteratedText.split('\n').map((l: string) => l.trim()).filter(Boolean);

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
            unit: '',
            unit_price: unitPrice
          });
        } else if (itemName) {
          // Add to raw lines for manual review if couldn't parse
          rawLines.push(line);
        }
      }

      // Calculate total from parsed items
      total = parsedItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    }

    console.log(`=== PARSING SERVED BY: ${parsingMethod} ===`);

    console.log('=== PARSED ITEMS ===');
    console.log(JSON.stringify(parsedItems, null, 2));
    console.log('=== END PARSED ITEMS ===');

    return NextResponse.json({ 
      total, 
      items: parsedItems,
      raw_lines: rawLines,
      provider,
      parsing_method: parsingMethod
    });
  } catch (err) {
    console.error('OCR error:', err);
    return NextResponse.json({ error: 'OCR failed' }, { status: 500 });
  }
}

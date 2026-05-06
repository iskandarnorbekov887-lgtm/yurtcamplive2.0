import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

/**
 * PATCH /api/meal-requests/[id]
 * Updates a meal request (e.g. Accept, Serve, or edit quantities).
 * Body: { status?: 'Pending'|'Accepted'|'Served', adult_qty?, child_qty?, notes? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const mealId = parseInt(id, 10);
    if (isNaN(mealId)) {
      return NextResponse.json({ error: 'Invalid meal request ID' }, { status: 400 });
    }

    const body = await request.json();
    const updates: Record<string, any> = {};

    if (body.status !== undefined) {
      if (!['Pending', 'Accepted', 'Served'].includes(body.status)) {
        return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
      }
      updates.status = body.status;
    }
    if (body.adult_qty !== undefined) updates.adult_qty = body.adult_qty;
    if (body.child_qty !== undefined) updates.child_qty = body.child_qty;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.dietary_type !== undefined) updates.dietary_type = body.dietary_type;

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('meal_requests')
      .update(updates)
      .eq('id', mealId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ meal: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

/**
 * DELETE /api/meal-requests/[id]
 * Deletes a meal request.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const mealId = parseInt(id, 10);
    if (isNaN(mealId)) {
      return NextResponse.json({ error: 'Invalid meal request ID' }, { status: 400 });
    }

    const { error } = await supabase.from('meal_requests').delete().eq('id', mealId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

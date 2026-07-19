import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // No settings found, return defaults
      return NextResponse.json({ priorityFee: 0.0005, slippage: 10 });
    }

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { priorityFee, slippage } = await request.json();

    // First try to get existing settings
    const { data: existingSettings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!existingSettings) {
      // Create new settings if none exist
      const { error: insertError } = await supabase
        .from('user_settings')
        .insert([{
          user_id: user.id,
          priority_fee: priorityFee,
          slippage: slippage
        }]);

      if (insertError) throw insertError;
    } else {
      // Update existing settings
      const { error: updateError } = await supabase
        .from('user_settings')
        .update({
          priority_fee: priorityFee,
          slippage: slippage
        })
        .eq('user_id', user.id);

      if (updateError) throw updateError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving settings:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
} 
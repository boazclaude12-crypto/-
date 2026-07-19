import { NextResponse } from "next/server";
import { createClient } from '../../../../../lib/supabase/server';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get wallet with private key from database
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('private_key')
      .eq('user_id', user.id)
      .single();

    if (error || !wallet) {
      return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
    }

    if (!wallet.private_key) {
      return NextResponse.json({ error: "Private key not found" }, { status: 404 });
    }

    return NextResponse.json({ privateKey: wallet.private_key });
  } catch (error: any) {
    console.error("Error exporting private key:", error);
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
} 
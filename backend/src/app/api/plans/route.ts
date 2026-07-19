import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export async function GET() {
    try {
        const supabase = await createClient(); // Now returns our server-side client
        const { data: plans } = await supabase
          .from("plans")
          .select()
    
        if (!plans)
          return NextResponse.json({ error: "Plans not found" }, { status: 403 });
        
        return NextResponse.json({ plans });
      } catch (error: any) {
        console.error("Error in plans API:", error);
        return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
      }
}

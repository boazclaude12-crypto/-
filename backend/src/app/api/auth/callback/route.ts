import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest } from 'next/server'

import { createClient } from '../../../../../lib/supabase/server'
import { redirect } from 'next/navigation'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token')
  const type = searchParams.get('type') as EmailOtpType | null || "signup"
  const next = searchParams.get('next') ?? '/dashboard'
  const email = searchParams.get('email') || ""
  const data = searchParams.get('data') || ""
  console.log("Data: " + data);
  
  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      token: token_hash,
      email: email,
      type: "signup",
    })
    if (!error) {
      // redirect user to specified redirect URL or root of app
      redirect(next)
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user)
    {
      const { error: updateUser } = await supabase
      .from("user_profiles")
      .update({
        name: data,
      })
      .eq("user_id", user.id);
    }
  }

  // redirect the user to an error page with some instructions
  redirect('/error')
}
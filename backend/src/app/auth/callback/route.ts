import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase/server'

export async function GET(request: NextRequest) {
  // Get the URL and code from the request
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  
  if (code) {
    const supabase = await createClient()
    
    // Exchange the code for a session
    await supabase.auth.exchangeCodeForSession(code)
    
    // Redirect to dashboard after successful authentication
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // If there's no code, something went wrong, redirect to home
  return NextResponse.redirect(new URL('/?auth=login', request.url))
} 
import { createClient } from '../../../../lib/supabase/server';
import { NextResponse } from 'next/server';
import { EmailOtpType } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  
  if (token_hash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash,
    });

    if (!error && data.session) {
      // Create URL with base path
      const resetUrl = new URL('/reset-password', request.url);
      // Add recovery type
      resetUrl.searchParams.set('type', 'recovery');
      // Add tokens to hash
      resetUrl.hash = `access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}`;
      return NextResponse.redirect(resetUrl);
    }
  }

  // Add error param to help debugging
  return NextResponse.redirect(new URL('/auth?error=invalid_reset_link', request.url));
}
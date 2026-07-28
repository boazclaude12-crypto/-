import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { headers } from 'next/headers';
import { createClient } from '../../../../../lib/supabase/server';
import supabaseAdmin from '../../../../../lib/supabase/supabaseAdmin';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-02-24.acacia',
  });
}

async function findUserByEmail(customerEmail: string): Promise<any> {
  // Get user from Supabase Auth with pagination
  const { data, error } = await supabaseAdmin.rpc(
    "get_user_id_by_email",
    {
      email: customerEmail,
    }
  );
  if(data) {
    console.log('✅ User found:', data[0].user_id);
    return data[0];
  } else {
    throw new Error('User not found');
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Processing webhook request...');
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      console.error('❌ No stripe signature found in request headers');
      return NextResponse.json({ error: 'No signature found' }, { status: 400 });
    }

    console.log('✅ Received webhook with signature:', signature);
    console.log('🔑 Using webhook secret:', process.env.STRIPE_WEBHOOK_SECRET?.slice(0, 5) + '...');

    let event: Stripe.Event;
    try {
      console.log('🔍 Verifying webhook signature...');
      event = getStripe().webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
      console.log('✅ Webhook signature verified');
    } catch (err: any) {
      console.error('❌ Error verifying webhook signature:', {
        error: err.message,
        type: err.type,
        code: err.code,
        signature,
        bodyPreview: body.slice(0, 100) + '...'
      });
      return NextResponse.json(
        { error: `Webhook Error: ${err.message}` },
        { status: 400 }
      );
    }

    console.log('📥 Webhook event received:', event.type);
    console.log('🔄 Creating Supabase client...');
    const supabase = await createClient();
    console.log('✅ Supabase client created');

    switch (event.type) {
      case 'checkout.session.completed': {
        console.log('💳 Processing checkout.session.completed event');
        const session = event.data.object as Stripe.Checkout.Session;
        
        console.log('📧 Gathering email information:', {
          customer_email: session.customer_email,
          customer_details_email: session.customer_details?.email,
          metadata_email: session.metadata?.email,
        });

        const customerEmail = session.customer_email || session.customer_details?.email || session.metadata?.email;
        console.log('📧 Initial customer email:', customerEmail);

        console.log('👤 Fetching customer details from Stripe...');
        const customerId = session.customer as string;
        const customer = await getStripe().customers.retrieve(customerId) as Stripe.Customer;
        console.log('✅ Customer details retrieved:', {
          customer_id: customerId,
          customer_email: customer.email,
          customer_metadata: customer.metadata
        });

        const finalEmail = customerEmail || customer.email;
        console.log('📧 Final email to use:', finalEmail);

        if (!finalEmail) {
          console.error('❌ No email found in any source');
          return NextResponse.json({ error: 'No email found' }, { status: 400 });
        }

        console.log('🔄 Retrieving subscription details...');
        const subscriptionId = session.subscription as string;
        console.log('📝 Subscription ID:', subscriptionId);
        
        const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
        console.log('✅ Subscription retrieved:', subscription.id);
        
        const priceId = subscription.items.data[0]?.price.id;
        console.log('💰 Price ID:', priceId);

        console.log('🔄 Looking up plan in database...');
        const { data: plans } = await supabase
          .from('plans')
          .select('id')
          .eq('price_id', priceId)
          .order('id', { ascending: true });

        if (!plans || plans.length === 0) {
          console.error('❌ No plan found for price_id:', priceId);
          return NextResponse.json({ error: 'No plan found' }, { status: 400 });
        }

        const plan = plans[0];
        console.log('✅ Selected plan:', plan);

        console.log('🔄 Looking up user by email:', finalEmail);
        let foundUser;
        try {
          foundUser = await findUserByEmail(finalEmail);
          console.log('✅ User found:', foundUser.id);
        } catch (error: any) {
          console.error('❌ Error finding user:', error);
          return NextResponse.json({ error: error.message }, { status: 400 });
        }

        console.log('🔄 Updating user profile...');
        const { error: updateProfileError } = await supabase
          .from('user_profiles')
          .update({ 
            plan_id: plan?.id,
            last_bill_date: new Date().toISOString(),
            disable_date: new Date((subscription.trial_end || subscription.current_period_end) * 1000).toISOString(),
            recurring_is_active: true,
          })
          .eq('user_id', foundUser.id);

        if (updateProfileError) {
          console.error('❌ Error updating user profile:', updateProfileError);
          return NextResponse.json({ error: 'Error updating user profile' }, { status: 500 });
        }
        console.log('✅ User profile updated successfully');
        break;
      }

      case 'customer.subscription.updated': {
        console.log('🔄 Processing customer.subscription.updated event');
        const subscription = event.data.object as Stripe.Subscription;
        const priceId = subscription.items.data[0]?.price.id;
        const customerId = subscription.customer as string;
        const recurring_is_active = subscription.status === 'active' || subscription.status === 'trialing';
        
        console.log('👤 Fetching customer details...');
        console.log('🔑 Customer ID:', customerId);
        const customer = await getStripe().customers.retrieve(customerId) as Stripe.Customer;
        console.log('✅ Customer details retrieved');
        
        const customerEmail = customer.email;
        console.log('📧 Customer email:', customerEmail);

        if (!customerEmail) {
          console.error('❌ No customer email found:', customer);
          return NextResponse.json({ error: 'No customer email found' }, { status: 400 });
        }

        console.log('🔄 Looking up plan...');
        const { data: plans } = await supabase
          .from('plans')
          .select('id')
          .eq('price_id', priceId)
          .order('id', { ascending: true });

        if (!plans || plans.length === 0) {
          console.error('❌ No plan found for price_id:', priceId);
          return NextResponse.json({ error: 'No plan found' }, { status: 400 });
        }

        const plan = plans[0];
        console.log('✅ Selected plan:', plan);

        console.log('🔄 Looking up user...');
        let foundUser;
        try {
          foundUser = await findUserByEmail(customerEmail);
          console.log('✅ User found:', foundUser.id);
        } catch (error: any) {
          console.error('❌ Error finding user:', error);
          return NextResponse.json({ error: error.message }, { status: 400 });
        }

        console.log('🔄 Updating user profile...');
        const { error: updateProfileError } = await supabase
          .from('user_profiles')
          .update({
            plan_id: plan.id,
            last_bill_date: new Date().toISOString(),
            disable_date: new Date((subscription.trial_end || subscription.current_period_end) * 1000).toISOString(),
            recurring_is_active: recurring_is_active,
          })
          .eq('user_id', foundUser.id);

        if (updateProfileError) {
          console.error('❌ Error updating user profile:', updateProfileError);
          return NextResponse.json({ error: updateProfileError.message }, { status: 500 });
        }
        console.log('✅ User profile updated successfully');
        break;
      }

      case 'customer.subscription.deleted': {
        console.log('🔄 Processing customer.subscription.deleted event');
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        console.log('👤 Fetching customer details...');
        const customer = await getStripe().customers.retrieve(customerId) as Stripe.Customer;
        const customerEmail = customer.email;
        console.log('📧 Customer email:', customerEmail);

        if (!customerEmail) {
          console.error('❌ No customer email found');
          return NextResponse.json({ error: 'No customer email found' }, { status: 400 });
        }

        console.log('🔄 Looking up user...');
        let user;
        try {
          user = await findUserByEmail(customerEmail);
          console.log('✅ User found:', user.id);
        } catch (error: any) {
          console.error('❌ Error finding user:', error);
          return NextResponse.json({ error: error.message }, { status: 400 });
        }

        console.log('🔄 Updating user profile...');
        const { error: updateProfileError } = await supabase
          .from('user_profiles')
          .update({
            recurring_is_active: false,
            disable_date: new Date().toISOString(),
          })
          .eq('user_id', user.id);

        if (updateProfileError) {
          console.error('❌ Error updating user profile:', updateProfileError);
          return NextResponse.json({ error: updateProfileError.message }, { status: 500 });
        }
        console.log('✅ User profile updated successfully');
        break;
      }

      case 'invoice.payment_failed': {
        console.log('🔄 Processing invoice.payment_failed event');
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        console.log('👤 Fetching customer details...');
        const customer = await getStripe().customers.retrieve(customerId) as Stripe.Customer;
        const customerEmail = customer.email;
        console.log('📧 Customer email:', customerEmail);

        if (!customerEmail) {
          console.error('❌ No customer email found');
          return NextResponse.json({ error: 'No customer email found' }, { status: 400 });
        }

        console.log('🔄 Looking up user...');
        let user;
        try {
          user = await findUserByEmail(customerEmail);
          console.log('✅ User found:', user.id);
        } catch (error: any) {
          console.error('❌ Error finding user:', error);
          return NextResponse.json({ error: error.message }, { status: 400 });
        }

        console.log('🔄 Updating user profile...');
        const { error: updateProfileError } = await supabase
          .from('user_profiles')
          .update({
            recurring_is_active: false,
            plan_id: null,
          })
          .eq('user_id', user.id);

        if (updateProfileError) {
          console.error('❌ Error updating user profile:', updateProfileError);
          return NextResponse.json({ error: updateProfileError.message }, { status: 500 });
        }
        console.log('✅ User profile updated successfully');
        break;
      }
    }

    console.log('✅ Webhook processed successfully');
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('❌ Error processing webhook:', err);
    return NextResponse.json(
      { error: 'Webhook error' },
      { status: 400 }
    );
  }
}

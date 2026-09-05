import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The tier every account starts on. Hidden from the pricing table, and the
 * level a lapsed paid subscription falls back to.
 */
export const TRIAL_PLAN_ID = 7;

/** Used only when the plans table cannot be read at all. */
const FALLBACK = { dailyLimit: 3, dailyChatLimit: 0 };

export interface Entitlement {
  planId: number | null;
  planName: string | null;
  dailyLimit: number;
  dailyChatLimit: number;
  /** False once a paid subscription has lapsed. */
  active: boolean;
  /** When the current paid period ends, if one is set. */
  expiresAt: string | null;
  /** True when a paid plan was downgraded because its period had ended. */
  expired: boolean;
}

/**
 * What a user is actually entitled to right now.
 *
 * A paid plan_id alone is not enough: disable_date marks the end of the paid
 * period, and nothing was checking it, so a lapsed or cancelled subscription
 * kept full access indefinitely. Access is granted while that date is still in
 * the future — a user who cancels keeps what they paid for until the period
 * ends — and drops to the trial tier once it passes.
 */
export async function getEntitlement(
  supabase: SupabaseClient,
  userId: string
): Promise<Entitlement> {
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("plan_id, recurring_is_active, disable_date")
    .eq("user_id", userId)
    .single();

  const expiresAt: string | null = profile?.disable_date ?? null;
  const lapsed = expiresAt !== null && new Date(expiresAt).getTime() < Date.now();

  // A lapsed paid plan is served the trial tier instead of its own.
  const isTrial = !profile?.plan_id || profile.plan_id === TRIAL_PLAN_ID;
  const expired = lapsed && !isTrial;
  const effectivePlanId = expired ? TRIAL_PLAN_ID : (profile?.plan_id ?? TRIAL_PLAN_ID);

  const { data: plan } = await supabase
    .from("plans")
    .select("id, name, daily_limit, daily_chat_limit")
    .eq("id", effectivePlanId)
    .single();

  return {
    planId: plan?.id ?? null,
    planName: plan?.name ?? null,
    dailyLimit: plan?.daily_limit ?? FALLBACK.dailyLimit,
    dailyChatLimit: plan?.daily_chat_limit ?? FALLBACK.dailyChatLimit,
    active: !expired,
    expiresAt,
    expired,
  };
}

/**
 * Requests the user has made since midnight Israel time, which is where the
 * daily quota resets.
 */
export async function getUsedToday(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const israelMidnight = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })
  );
  israelMidnight.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("user_requests")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", israelMidnight.toISOString());

  return data?.length ?? 0;
}

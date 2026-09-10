import type { FastifyReply, FastifyRequest } from 'fastify';
// Brings setCookie/clearCookie/request.cookies onto the Fastify types.
import type {} from '@fastify/cookie';
import type { AppServices } from '../../services/container.js';
import type { ChannelRecord, ChannelSettingsRecord, UserRecord } from '../../db/types.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../shared/errors.js';
import { newSessionToken, sha256 } from '../../shared/crypto.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserRecord;
    sessionId?: string;
  }
}

export interface SessionCookieOptions {
  name: string;
  ttlDays: number;
  secure: boolean;
}

/** Issues a session: the client gets the token, the database only ever sees its hash. */
export async function issueSession(
  services: AppServices,
  reply: FastifyReply,
  user: UserRecord,
  meta: { userAgent?: string; ip?: string },
): Promise<void> {
  const { token, hash } = newSessionToken();
  const expiresAt = new Date(services.clock.now().getTime() + services.config.security.sessionTtlDays * 86_400_000);

  await services.repos.sessions.create({
    userId: user.id,
    tokenHash: hash,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    ip: meta.ip ?? null,
    expiresAt,
    revokedAt: null,
  });

  reply.setCookie(services.config.security.sessionCookie, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: services.config.isProduction,
    expires: expiresAt,
  });
}

export async function clearSession(services: AppServices, request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.cookies[services.config.security.sessionCookie];
  if (token) {
    const session = await services.repos.sessions.findByTokenHash(sha256(token));
    if (session) await services.repos.sessions.revoke(session.id, services.clock.now());
  }
  reply.clearCookie(services.config.security.sessionCookie, { path: '/' });
}

/**
 * Resolves the caller from the session cookie. Runs on every request as a preHandler so
 * that `request.user` is either a real, non-revoked, unexpired user or undefined.
 */
export function attachUser(services: AppServices) {
  return async (request: FastifyRequest): Promise<void> => {
    const token = request.cookies[services.config.security.sessionCookie];
    if (!token) return;

    const session = await services.repos.sessions.findByTokenHash(sha256(token));
    if (!session || session.revokedAt || session.expiresAt <= services.clock.now()) return;

    const user = await services.repos.users.findById(session.userId);
    if (!user) return;
    request.user = user;
    request.sessionId = session.id;
  };
}

export function requireUser(request: FastifyRequest): UserRecord {
  if (!request.user) throw new UnauthorizedError();
  return request.user;
}

export function requireAdmin(request: FastifyRequest): UserRecord {
  const user = requireUser(request);
  if (user.role !== 'ADMIN') throw new ForbiddenError('Administrator access is required');
  return user;
}

/**
 * Resolves a channel *and asserts ownership* before any handler body runs. Every
 * channel-scoped route goes through this, which is what makes cross-tenant access
 * impossible rather than merely unlikely (spec §46).
 */
export async function requireChannel(
  services: AppServices,
  request: FastifyRequest,
  channelId: string,
): Promise<{ user: UserRecord; channel: ChannelRecord; settings: ChannelSettingsRecord }> {
  const user = requireUser(request);
  const channel = await services.repos.channels.findById(channelId);
  if (!channel) throw new NotFoundError('Channel');
  if (channel.userId !== user.id && user.role !== 'ADMIN') throw new NotFoundError('Channel');

  const settings = await services.repos.channelSettings.findByChannel(channel.id);
  if (!settings) throw new NotFoundError('Channel settings');
  return { user, channel, settings };
}

/** Same ownership guarantee for a video, resolved through its channel. */
export async function requireVideo(services: AppServices, request: FastifyRequest, videoId: string) {
  const user = requireUser(request);
  const video = await services.repos.videos.findById(videoId);
  if (!video) throw new NotFoundError('Video');
  const channel = await services.repos.channels.findById(video.channelId);
  if (!channel || (channel.userId !== user.id && user.role !== 'ADMIN')) throw new NotFoundError('Video');
  return { user, video, channel };
}

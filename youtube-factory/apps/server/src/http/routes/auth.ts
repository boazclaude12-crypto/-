import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../../services/container.js';
import { clearSession, issueSession, requireUser } from '../middleware/auth.js';
import { hashPassword, verifyPassword } from '../../shared/crypto.js';
import { ConflictError, ForbiddenError, UnauthorizedError } from '../../shared/errors.js';
import { seedSystem } from '../../cli/seed.js';
import { strictLimit } from '../middleware/limits.js';

const credentialsSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(10).max(200),
  name: z.string().max(120).optional(),
});

export async function authRoutes(app: FastifyInstance, services: AppServices): Promise<void> {
  app.post('/api/auth/register', strictLimit, async (request, reply) => {
    if (!services.config.security.allowRegistration) {
      throw new ForbiddenError('Registration is disabled on this instance');
    }
    const body = credentialsSchema.parse(request.body);

    const existing = await services.repos.users.findByEmail(body.email);
    if (existing) throw new ConflictError('An account with that email already exists');

    // The very first account owns the instance.
    const isFirst = (await services.repos.users.count()) === 0;
    const user = await services.repos.users.create({
      email: body.email.toLowerCase(),
      passwordHash: hashPassword(body.password),
      name: body.name ?? null,
      role: isFirst ? 'ADMIN' : 'USER',
    });

    await seedSystem(services, user.id);
    await issueSession(services, reply, user, { userAgent: request.headers['user-agent'], ip: request.ip });
    return reply.status(201).send({ user: publicUser(user) });
  });

  app.post('/api/auth/login', strictLimit, async (request, reply) => {
    const body = credentialsSchema.pick({ email: true, password: true }).parse(request.body);
    const user = await services.repos.users.findByEmail(body.email);

    // Verify against a dummy hash when the account does not exist, so a wrong email and a
    // wrong password take the same amount of time.
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const ok = verifyPassword(body.password, hash);
    if (!user || !ok) throw new UnauthorizedError('Incorrect email or password');

    await issueSession(services, reply, user, { userAgent: request.headers['user-agent'], ip: request.ip });
    return { user: publicUser(user) };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    await clearSession(services, request, reply);
    return { ok: true };
  });

  app.get('/api/auth/me', async (request) => {
    const user = requireUser(request);
    const channels = await services.repos.channels.listByUser(user.id);
    return {
      user: publicUser(user),
      channels: channels.map((c) => ({ id: c.id, name: c.name, isDefault: c.isDefault, enabled: c.enabled })),
    };
  });

  app.post('/api/auth/password', strictLimit, async (request) => {
    const user = requireUser(request);
    const body = z
      .object({ currentPassword: z.string(), newPassword: z.string().min(10).max(200) })
      .parse(request.body);

    if (!verifyPassword(body.currentPassword, user.passwordHash)) {
      throw new UnauthorizedError('Current password is incorrect');
    }
    await services.repos.users.update(user.id, { passwordHash: hashPassword(body.newPassword) });
    // Changing a password invalidates every other session.
    await services.repos.sessions.revokeAllForUser(user.id, services.clock.now());
    return { ok: true };
  });
}

/** Constant-time-ish stand-in so a missing account is not detectable by timing. */
const DUMMY_HASH = hashPassword('dummy-password-for-timing-parity');

export function publicUser(user: { id: string; email: string; name?: string | null; role: string; createdAt: Date }) {
  return { id: user.id, email: user.email, name: user.name ?? null, role: user.role, createdAt: user.createdAt };
}

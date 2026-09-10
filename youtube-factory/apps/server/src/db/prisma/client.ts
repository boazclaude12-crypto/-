import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

/** Single pooled client per process; Prisma manages the connection pool itself. */
export function prismaClient(databaseUrl?: string): PrismaClient {
  if (!client) {
    client = new PrismaClient(
      databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
    );
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}

/** Prisma returns BigInt for 64-bit columns; the domain uses plain numbers. */
export function fromBigInt(value: bigint | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function toBigInt(value: number | null | undefined): bigint | null {
  return value === null || value === undefined ? null : BigInt(Math.round(value));
}

export function asJson<T>(value: unknown): T | null {
  return (value ?? null) as T | null;
}

import type { PromptRepository } from '../../db/ports.js';
import type { PromptTemplateRecord } from '../../db/types.js';
import { NotFoundError } from '../../shared/errors.js';

/**
 * Prompt management (spec §51). Prompts live in the database with a version and an active
 * flag; agents reference them by name only. Nothing in `src/agents/*.ts` contains a prompt
 * literal, so a prompt can be revised, A/B-compared through `AgentRun` statistics and rolled
 * back without a deploy.
 */
export interface ResolvedPrompt {
  id?: string;
  name: string;
  version: number;
  systemPrompt: string;
  userPrompt: string;
  variables: string[];
}

export interface PromptSeed {
  name: string;
  systemPrompt: string;
  userTemplate: string;
  variables: string[];
  notes?: string;
}

export class PromptLibrary {
  private readonly cache = new Map<string, PromptTemplateRecord>();

  constructor(
    private readonly repo: PromptRepository,
    private readonly seeds: Map<string, PromptSeed>,
  ) {}

  /** Loads the active version for `name`, preferring a user-specific override. */
  async resolve(
    name: string,
    variables: Record<string, unknown>,
    userId?: string | null,
  ): Promise<ResolvedPrompt> {
    const cacheKey = `${name}:${userId ?? 'system'}`;
    let record = this.cache.get(cacheKey) ?? null;
    if (!record) {
      record = await this.repo.findActive(name, userId ?? null);
      if (record) this.cache.set(cacheKey, record);
    }

    if (record) {
      return {
        id: record.id,
        name: record.name,
        version: record.version,
        systemPrompt: render(record.systemPrompt, variables),
        userPrompt: render(record.userTemplate, variables),
        variables: record.variables,
      };
    }

    // Falling back to the seed keeps a fresh install working before `factory seed` runs.
    const seed = this.seeds.get(name);
    if (!seed) throw new NotFoundError(`Prompt "${name}"`);
    return {
      name: seed.name,
      version: 0,
      systemPrompt: render(seed.systemPrompt, variables),
      userPrompt: render(seed.userTemplate, variables),
      variables: seed.variables,
    };
  }

  invalidate(): void {
    this.cache.clear();
  }

  /** Writes any seed that is not yet in the database. Idempotent. */
  async seedMissing(): Promise<{ created: string[]; existing: string[] }> {
    const created: string[] = [];
    const existing: string[] = [];
    for (const seed of this.seeds.values()) {
      const current = await this.repo.findActive(seed.name, null);
      if (current) {
        existing.push(seed.name);
        continue;
      }
      await this.repo.create({
        userId: null,
        name: seed.name,
        version: 1,
        provider: null,
        systemPrompt: seed.systemPrompt,
        userTemplate: seed.userTemplate,
        variables: seed.variables,
        active: true,
        notes: seed.notes ?? null,
      });
      created.push(seed.name);
    }
    this.invalidate();
    return { created, existing };
  }
}

/**
 * `{{name}}` substitution. Objects and arrays are rendered as pretty JSON so the model sees
 * structure; `undefined` renders as an empty string rather than the word "undefined".
 */
export function render(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = lookup(variables, path);
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value, null, 2);
  });
}

function lookup(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, source);
}

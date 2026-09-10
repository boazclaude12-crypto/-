import { z, type ZodTypeAny } from 'zod';

/**
 * Minimal zod → JSON Schema converter covering exactly the constructs our agent output
 * schemas use. We keep it in-house because the output feeds provider tool definitions and
 * we need full control over the dialect each vendor accepts (Anthropic input_schema and
 * OpenAI strict json_schema both want plain draft-07-ish objects with no $ref).
 */
export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  default?: unknown;
  format?: string;
}

export interface ConvertOptions {
  /**
   * OpenAI's strict mode requires every property to appear in `required` and forbids
   * defaults; optional properties are expressed as a nullable union instead.
   */
  strict?: boolean;
}

export function zodToJsonSchema(schema: ZodTypeAny, opts: ConvertOptions = {}): JsonSchema {
  return convert(schema, opts, 0);
}

function convert(schema: ZodTypeAny, opts: ConvertOptions, depth: number): JsonSchema {
  if (depth > 12) return {};
  const def = schema._def as { typeName?: string; [k: string]: unknown };

  switch (def.typeName) {
    case z.ZodFirstPartyTypeKind.ZodString: {
      const out: JsonSchema = { type: 'string' };
      for (const check of (def.checks ?? []) as Array<{ kind: string; value?: number }>) {
        if (check.kind === 'min') out.minLength = check.value;
        if (check.kind === 'max') out.maxLength = check.value;
        if (check.kind === 'url') out.format = 'uri';
      }
      return withDescription(out, schema);
    }
    case z.ZodFirstPartyTypeKind.ZodNumber: {
      const out: JsonSchema = { type: 'number' };
      for (const check of (def.checks ?? []) as Array<{ kind: string; value?: number }>) {
        if (check.kind === 'min') out.minimum = check.value;
        if (check.kind === 'max') out.maximum = check.value;
        if (check.kind === 'int') out.type = 'integer';
      }
      return withDescription(out, schema);
    }
    case z.ZodFirstPartyTypeKind.ZodBoolean:
      return withDescription({ type: 'boolean' }, schema);
    case z.ZodFirstPartyTypeKind.ZodDate:
      return withDescription({ type: 'string', format: 'date-time' }, schema);
    case z.ZodFirstPartyTypeKind.ZodLiteral:
      return { const: (def as { value: unknown }).value };
    case z.ZodFirstPartyTypeKind.ZodEnum:
      return withDescription({ type: 'string', enum: [...((def as { values: string[] }).values)] }, schema);
    case z.ZodFirstPartyTypeKind.ZodNativeEnum:
      return { type: 'string', enum: Object.values((def as { values: object }).values) };
    case z.ZodFirstPartyTypeKind.ZodArray: {
      const inner = (def as { type: ZodTypeAny }).type;
      const out: JsonSchema = { type: 'array', items: convert(inner, opts, depth + 1) };
      const min = (def as { minLength?: { value: number } | null }).minLength;
      const max = (def as { maxLength?: { value: number } | null }).maxLength;
      if (min) out.minItems = min.value;
      if (max) out.maxItems = max.value;
      return withDescription(out, schema);
    }
    case z.ZodFirstPartyTypeKind.ZodObject: {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        const field = value as ZodTypeAny;
        const optional = isOptional(field);
        let sub = convert(unwrap(field), opts, depth + 1);
        if (optional && opts.strict) {
          sub = nullable(sub);
          required.push(key);
        } else if (!optional) {
          required.push(key);
        }
        properties[key] = sub;
      }
      const out: JsonSchema = { type: 'object', properties, additionalProperties: false };
      if (required.length) out.required = required;
      return withDescription(out, schema);
    }
    case z.ZodFirstPartyTypeKind.ZodRecord:
      return { type: 'object', additionalProperties: true };
    case z.ZodFirstPartyTypeKind.ZodUnion: {
      const options = (def as { options: ZodTypeAny[] }).options;
      return { anyOf: options.map((o) => convert(o, opts, depth + 1)) };
    }
    case z.ZodFirstPartyTypeKind.ZodOptional:
    case z.ZodFirstPartyTypeKind.ZodNullable:
    case z.ZodFirstPartyTypeKind.ZodDefault:
    case z.ZodFirstPartyTypeKind.ZodEffects:
    case z.ZodFirstPartyTypeKind.ZodCatch:
      return convert(unwrap(schema), opts, depth);
    case z.ZodFirstPartyTypeKind.ZodUnknown:
    case z.ZodFirstPartyTypeKind.ZodAny:
      return {};
    default:
      return {};
  }
}

function nullable(s: JsonSchema): JsonSchema {
  if (Array.isArray(s.type)) return s;
  if (typeof s.type === 'string') return { ...s, type: [s.type, 'null'] };
  return s;
}

function withDescription(out: JsonSchema, schema: ZodTypeAny): JsonSchema {
  const description = schema.description;
  return description ? { ...out, description } : out;
}

function isOptional(schema: ZodTypeAny): boolean {
  const t = (schema._def as { typeName?: string }).typeName;
  return (
    t === z.ZodFirstPartyTypeKind.ZodOptional ||
    t === z.ZodFirstPartyTypeKind.ZodDefault ||
    t === z.ZodFirstPartyTypeKind.ZodNullable
  );
}

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  const def = schema._def as { typeName?: string; innerType?: ZodTypeAny; schema?: ZodTypeAny };
  switch (def.typeName) {
    case z.ZodFirstPartyTypeKind.ZodOptional:
    case z.ZodFirstPartyTypeKind.ZodNullable:
    case z.ZodFirstPartyTypeKind.ZodDefault:
    case z.ZodFirstPartyTypeKind.ZodCatch:
      return unwrap(def.innerType as ZodTypeAny);
    case z.ZodFirstPartyTypeKind.ZodEffects:
      return unwrap(def.schema as ZodTypeAny);
    default:
      return schema;
  }
}

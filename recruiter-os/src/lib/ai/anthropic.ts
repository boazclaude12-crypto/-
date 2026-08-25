import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env';
import { parseCvText, type ParsedCv } from './cv-parser';
import { renderMessage } from './templates';
import type { AiProvider, ChatAnswer, ChatRequest, GeneratedMessage, MessageRequest } from './types';

const CV_SYSTEM = `אתה עוזר לרכז גיוס לקרוא קורות חיים.
החזר JSON בלבד, ללא טקסט נוסף וללא סימוני קוד, במבנה הבא:
{"first_name":string|null,"last_name":string|null,"phone":string|null,"email":string|null,
 "city":string|null,"current_role":string|null,"years_experience":number|null,"education":string|null,
 "licenses":string[],"certifications":string[],"skills":string[],"languages":string[],
 "experiences":[{"company":string,"title":string,"start_date":string|null,"end_date":string|null,"is_current":boolean,"description":string|null}]}

כלל ברזל: אם מידע אינו מופיע במסמך — החזר null או מערך ריק. אין להשלים, לנחש או להמציא פרטים.`;

const MESSAGE_SYSTEM = `אתה רכז גיוס ישראלי מנוסה שכותב הודעות קצרות ואפקטיביות למועמדים בעברית.
כתוב הודעה אחת בלבד, בגוף ההודעה בלבד, בלי כותרות ובלי הסברים.
היה ספציפי לגבי המשרה, אל תמציא פרטים שלא נמסרו לך, וסיים בשאלה אחת ברורה.`;

const CHAT_SYSTEM = `אתה עוזר אישי לרכז גיוס פרילנסר. ענה בעברית, קצר וענייני.
מותר להסתמך אך ורק על הנתונים שמופיעים בהקשר שנמסר לך — הם מגיעים ממסד הנתונים של המשתמש.
אם התשובה אינה נמצאת בהקשר, אמור זאת במפורש והצע איזה מידע חסר. אין להמציא מועמדים, לקוחות, משרות או מספרים.`;

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1]! : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object in response');
  return JSON.parse(body.slice(start, end + 1));
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Claude-backed provider, used when ANTHROPIC_API_KEY is set.
 *
 * Every method falls back to the local engine on any failure, so a network problem or
 * a rate limit degrades quality without ever breaking the user's workflow.
 */
export class AnthropicAiProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly isConfigured: boolean;
  #client: Anthropic | null;
  #model: string;

  constructor() {
    this.isConfigured = Boolean(env.anthropicApiKey);
    this.#model = env.anthropicModel;
    this.#client = this.isConfigured ? new Anthropic({ apiKey: env.anthropicApiKey }) : null;
  }

  async parseCv(text: string): Promise<ParsedCv> {
    const local = parseCvText(text);
    if (!this.#client) return local;

    try {
      const response = await this.#client.messages.create({
        model: this.#model,
        max_tokens: 4000,
        system: CV_SYSTEM,
        messages: [{ role: 'user', content: text.slice(0, 60_000) }],
      });
      const data = extractJson(textOf(response)) as Record<string, unknown>;

      const experiences = Array.isArray(data.experiences)
        ? (data.experiences as Array<Record<string, unknown>>).map((item) => ({
            company: asStringOrNull(item.company) ?? '',
            title: asStringOrNull(item.title) ?? '',
            start_date: asStringOrNull(item.start_date),
            end_date: asStringOrNull(item.end_date),
            is_current: item.is_current === true,
            description: asStringOrNull(item.description),
          })).filter((item) => item.title)
        : local.experiences;

      const merged: ParsedCv = {
        first_name: asStringOrNull(data.first_name) ?? local.first_name,
        last_name: asStringOrNull(data.last_name) ?? local.last_name,
        phone: asStringOrNull(data.phone) ?? local.phone,
        email: asStringOrNull(data.email) ?? local.email,
        city: asStringOrNull(data.city) ?? local.city,
        region: local.region,
        current_role: asStringOrNull(data.current_role) ?? local.current_role,
        years_experience:
          typeof data.years_experience === 'number' ? data.years_experience : local.years_experience,
        education: asStringOrNull(data.education) ?? local.education,
        licenses: asStringArray(data.licenses).length ? asStringArray(data.licenses) : local.licenses,
        certifications: asStringArray(data.certifications).length
          ? asStringArray(data.certifications)
          : local.certifications,
        skills: asStringArray(data.skills).length ? asStringArray(data.skills) : local.skills,
        languages: asStringArray(data.languages).length ? asStringArray(data.languages) : local.languages,
        experiences,
        missing: [],
        confidence: local.confidence,
      };

      const missing: string[] = [];
      if (!merged.first_name) missing.push('שם');
      if (!merged.phone) missing.push('טלפון');
      if (!merged.email) missing.push('אימייל');
      if (!merged.city) missing.push('עיר');
      if (merged.experiences.length === 0) missing.push('ניסיון תעסוקתי');
      if (!merged.education) missing.push('השכלה');
      merged.missing = missing;
      merged.confidence = Math.round(((6 - missing.length) / 6) * 100);

      return merged;
    } catch (error) {
      console.error('[ai] Claude CV parsing failed, using local parser', error);
      return local;
    }
  }

  async generateMessage(request: MessageRequest): Promise<GeneratedMessage> {
    if (!this.#client) return renderMessage(request);

    const toneLabels: Record<MessageRequest['tone'], string> = {
      short: 'קצרה מאוד — שתי שורות לכל היותר',
      professional: 'מקצועית ומכבדת',
      friendly: 'חמה וחברית',
      urgent: 'דחופה, מדגישה שהמשרה נסגרת',
      followup: 'הודעת מעקב אחרי שלא התקבל מענה',
    };

    const brief = [
      `ערוץ: ${request.channel}`,
      `סגנון: ${toneLabels[request.tone]}`,
      `שם הרכז: ${request.recruiter.name}`,
      `מועמד: ${request.candidate.name}`,
      request.candidate.current_role ? `תפקיד נוכחי: ${request.candidate.current_role}` : '',
      request.candidate.city ? `עיר: ${request.candidate.city}` : '',
      request.candidate.years_experience ? `ניסיון: ${request.candidate.years_experience} שנים` : '',
      request.job ? `משרה: ${request.job.title}` : 'אין משרה ספציפית',
      request.job?.city ? `מיקום המשרה: ${request.job.city}` : '',
      request.job?.salary_min || request.job?.salary_max
        ? `שכר: ${request.job?.salary_min ?? ''}–${request.job?.salary_max ?? ''} ל${request.job?.salary_period === 'hour' ? 'שעה' : 'חודש'}`
        : '',
      request.job?.highlights?.length ? `דגשים: ${request.job.highlights.join(', ')}` : '',
      request.context ? `הקשר נוסף: ${request.context}` : '',
    ].filter(Boolean).join('\n');

    try {
      const response = await this.#client.messages.create({
        model: this.#model,
        max_tokens: 1200,
        system: MESSAGE_SYSTEM,
        messages: [{ role: 'user', content: brief }],
      });
      const body = textOf(response);
      if (!body) return renderMessage(request);
      return {
        subject: request.channel === 'email' && request.job ? `הצעת עבודה: ${request.job.title}` : null,
        body,
        provider: this.name,
      };
    } catch (error) {
      console.error('[ai] Claude message generation failed, using template', error);
      return renderMessage(request);
    }
  }

  async answer(request: ChatRequest): Promise<ChatAnswer> {
    if (!this.#client) return { answer: request.context, provider: 'local' };

    try {
      const response = await this.#client.messages.create({
        model: this.#model,
        max_tokens: 2000,
        system: CHAT_SYSTEM,
        messages: [
          ...request.history.map((turn) => ({ role: turn.role, content: turn.content })),
          {
            role: 'user' as const,
            content: `נתונים מהמערכת:\n${request.context}\n\nהשאלה: ${request.question}`,
          },
        ],
      });
      const answer = textOf(response);
      return answer
        ? { answer, provider: this.name }
        : { answer: request.context, provider: 'local' };
    } catch (error) {
      console.error('[ai] Claude chat failed, using retrieved facts', error);
      return { answer: request.context, provider: 'local' };
    }
  }
}

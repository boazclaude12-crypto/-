import { getDb } from '../db/index';
import { repos } from '../db/repos';
import { logActivity } from '../domain/activity';
import { setCandidateTags, setJobTags } from '../domain/tags';
import { canonical, normalize, normalizePhone } from '../text';
import { calculateFee } from '../domain/placements';
import { regionOfCity } from '../geo';
import { addDays, dateOnly, nowIso } from '../time';

/**
 * Demo data for a working desk: real relationships end to end
 * (candidate → application → interview → placement → payment), so every screen has
 * something true to show and the matching engine has a database worth searching.
 */

/** Small deterministic PRNG so a reseed produces the same demo account. */
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const FIRST_NAMES_M = ['דני', 'יוסי', 'אבי', 'משה', 'עומר', 'איתי', 'רון', 'ניר', 'גיא', 'אלון', 'שי', 'עידו', 'ליאור', 'טל', 'אורי', 'ערן', 'בועז', 'חיים', 'סאמי', 'מרואן'];
const FIRST_NAMES_F = ['דנה', 'מיכל', 'נועה', 'שירה', 'רותם', 'הילה', 'ליאת', 'מור', 'אורית', 'יעל', 'סיון', 'עדי', 'לינוי', 'אפרת', 'רינת'];
const LAST_NAMES = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'דהן', 'אברהם', 'פרידמן', 'אזולאי', 'גבאי', 'שרון', 'ישראלי', 'חדד', 'מלכה', 'טל', 'ברק', 'נחום', 'סבן', 'עמר', 'זיו'];

const CITIES = ['חיפה', 'קריית אתא', 'קריית ביאליק', 'נשר', 'עכו', 'נהריה', 'כרמיאל', 'טבריה', 'עפולה', 'חדרה', 'נתניה', 'תל אביב', 'פתח תקווה', 'ראשון לציון', 'אשדוד', 'רחובות', 'ירושלים', 'באר שבע', 'רמלה', 'לוד'];

interface RoleProfile {
  role: string;
  licenses: string[];
  certifications: string[];
  skills: string[];
  salary: [number, number];
}

const ROLE_PROFILES: RoleProfile[] = [
  { role: 'נהג חלוקה', licenses: ['רישיון C'], certifications: [], skills: ['נהיגה', 'שירות לקוחות'], salary: [9000, 12500] },
  { role: 'נהג משאית', licenses: ['רישיון C', 'רישיון CE'], certifications: ['רכב כבד'], skills: ['נהיגה'], salary: [11000, 16000] },
  { role: 'נהג אוטובוס', licenses: ['רישיון D'], certifications: [], skills: ['שירות לקוחות'], salary: [10000, 14000] },
  { role: 'מלגזן', licenses: ['רישיון B'], certifications: ['מלגזה'], skills: ['ניהול מלאי', 'ליקוט'], salary: [8500, 11500] },
  { role: 'מחסנאי', licenses: [], certifications: ['מלגזה'], skills: ['ניהול מלאי', 'אקסל', 'ליקוט'], salary: [8000, 11000] },
  { role: 'מלקט', licenses: [], certifications: [], skills: ['ליקוט'], salary: [7500, 9500] },
  { role: 'מנופאי', licenses: ['רישיון C'], certifications: ['עגורן'], skills: [], salary: [13000, 18000] },
  { role: 'טכנאי שירות', licenses: ['רישיון B'], certifications: ['חשמלאי'], skills: ['שירות לקוחות'], salary: [10000, 15000] },
  { role: 'מנהל משמרת', licenses: [], certifications: ['ממונה בטיחות'], skills: ['ניהול צוות', 'אקסל'], salary: [12000, 17000] },
  { role: 'נציג שירות', licenses: [], certifications: [], skills: ['שירות לקוחות', 'CRM'], salary: [8000, 10500] },
];

const CLIENT_SEEDS = [
  { name: 'לוגיסטיקה צפון בע״מ', industry: 'לוגיסטיקה', city: 'חיפה', fee: 14 },
  { name: 'מרכז הפצה כרמל', industry: 'הפצה', city: 'נשר', fee: 12 },
  { name: 'תובלה ישראלית', industry: 'תחבורה', city: 'קריית אתא', fee: 15 },
  { name: 'מחסני הצפון', industry: 'אחסנה', city: 'עכו', fee: 12 },
  { name: 'סופר פרש רשת', industry: 'קמעונאות', city: 'נתניה', fee: 10 },
  { name: 'תעשיות גליל', industry: 'ייצור', city: 'כרמיאל', fee: 13 },
  { name: 'אלקטרו טק', industry: 'שירות טכני', city: 'תל אביב', fee: 16 },
  { name: 'בנייה ופיתוח דרום', industry: 'בנייה', city: 'באר שבע', fee: 14 },
  { name: 'מובילי המרכז', industry: 'תחבורה', city: 'פתח תקווה', fee: 12 },
  { name: 'קירור ומזון בע״מ', industry: 'מזון', city: 'אשדוד', fee: 11 },
];

const SOURCES = ['facebook', 'whatsapp_group', 'referral', 'job_board', 'website', 'walk_in', 'database'];
const AVAILABILITIES = ['immediate', 'immediate', 'two_weeks', 'month', 'later'];
const EMPLOYMENT = ['full_time', 'full_time', 'shifts', 'part_time'];

const PIPELINE_FLOW = ['new', 'contacted', 'interested', 'screening', 'interview', 'sent_to_client', 'client_interview', 'hired', 'started'];

export interface SeedResult {
  clients: number;
  jobs: number;
  candidates: number;
  applications: number;
  interviews: number;
  placements: number;
  payments: number;
  tasks: number;
  messages: number;
}

export interface SeedOptions {
  clients?: number;
  jobs?: number;
  candidates?: number;
  seed?: number;
}

/** True when the organisation already has demo-scale data (used to avoid double seeding). */
export function hasData(orgId: string): boolean {
  return repos.candidates.count(orgId) > 0 || repos.jobs.count(orgId) > 0;
}

export function seedDemoData(orgId: string, userId: string, options: SeedOptions = {}): SeedResult {
  const random = makeRandom(options.seed ?? 20260825);
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;
  const between = (min: number, max: number) => Math.round(min + random() * (max - min));
  const chance = (probability: number) => random() < probability;

  const clientCount = options.clients ?? 10;
  const jobCount = options.jobs ?? 30;
  const candidateCount = options.candidates ?? 100;

  const db = getDb();

  return db.transaction(() => {
    const result: SeedResult = {
      clients: 0, jobs: 0, candidates: 0, applications: 0,
      interviews: 0, placements: 0, payments: 0, tasks: 0, messages: 0,
    };

    /* ------------------------------ clients ------------------------------ */
    const clients = CLIENT_SEEDS.slice(0, clientCount).map((seed, index) => {
      const client = repos.clients.create(orgId, {
        name: seed.name,
        industry: seed.industry,
        city: seed.city,
        phone: normalizePhone(`04${between(6000000, 9999999)}`),
        email: `office${index + 1}@example.co.il`,
        status: index === clientCount - 1 ? 'lead' : 'active',
        fee_type: 'percent',
        fee_value: seed.fee,
        payment_terms_days: pick([30, 30, 45, 60]),
        notes: index % 3 === 0 ? 'מעדיפים מועמדים מהאזור. פידבק תוך 48 שעות.' : null,
        created_at: addDays(-between(120, 400)),
      });
      result.clients += 1;

      repos.clientContacts.create(orgId, {
        client_id: client.id,
        name: `${pick(FIRST_NAMES_F)} ${pick(LAST_NAMES)}`,
        role: pick(['מנהלת משאבי אנוש', 'מנהל תפעול', 'מנהלת גיוס']),
        phone: normalizePhone(`05${between(20000000, 89999999)}`),
        email: `hr${index + 1}@example.co.il`,
        is_primary: 1,
      });
      if (chance(0.4)) {
        repos.clientContacts.create(orgId, {
          client_id: client.id,
          name: `${pick(FIRST_NAMES_M)} ${pick(LAST_NAMES)}`,
          role: 'מנהל מחסן',
          phone: normalizePhone(`05${between(20000000, 89999999)}`),
          is_primary: 0,
        });
      }

      logActivity(orgId, {
        type: 'client.created',
        clientId: client.id,
        actorUserId: userId,
        summary: `לקוח נוסף: ${client.name}`,
        actor: 'user',
      });
      return client;
    });

    /* -------------------------------- jobs -------------------------------- */
    const jobs = Array.from({ length: jobCount }).map((_, index) => {
      const profile = pick(ROLE_PROFILES);
      const client = pick(clients);
      const openedDaysAgo = between(2, 90);
      const isClosed = index % 5 === 0 && openedDaysAgo > 30;
      const salaryMin = profile.salary[0] + between(0, 800);
      const salaryMax = profile.salary[1] - between(0, 800);

      const job = repos.jobs.create(orgId, {
        client_id: client.id,
        title: `${profile.role} — ${client.city}`,
        headcount: chance(0.25) ? between(2, 4) : 1,
        city: client.city,
        region: regionOfCity(client.city),
        salary_min: salaryMin,
        salary_max: Math.max(salaryMin + 500, salaryMax),
        salary_period: 'month',
        hours: pick(['07:00–16:00', '06:00–15:00', 'משמרות', '08:00–17:00']),
        work_days: pick(['א׳–ה׳', 'א׳–ו׳', 'משמרות מתחלפות']),
        employment_type: pick(EMPLOYMENT),
        // Most of this desk's work is on-site; a few roles allow hybrid.
        work_mode: chance(0.12) ? 'hybrid' : 'onsite',
        description: `דרוש/ה ${profile.role} ל${client.name}. עבודה קבועה, תנאים טובים למתאימים.`,
        benefits: pick(['ארוחות, הסעות, קרן השתלמות', 'בונוסים חודשיים, ביטוח בריאות', 'רכב צמוד, טלפון']),
        status: isClosed ? 'closed' : pick(['open', 'open', 'sourcing', 'on_hold']),
        priority: chance(0.15) ? 'urgent' : chance(0.3) ? 'high' : 'normal',
        opened_at: addDays(-openedDaysAgo),
        closed_at: isClosed ? addDays(-between(1, 10)) : null,
        deadline: chance(0.4) ? dateOnly(addDays(between(3, 30))) : null,
        fee_type: 'percent',
        fee_value: client.fee_value,
        created_at: addDays(-openedDaysAgo),
      });
      result.jobs += 1;

      for (const license of profile.licenses) {
        repos.jobRequirements.create(orgId, {
          job_id: job.id, kind: 'license', value: license,
          value_norm: canonical(license), is_required: 1, weight: 1,
        });
      }
      for (const certification of profile.certifications) {
        repos.jobRequirements.create(orgId, {
          job_id: job.id, kind: 'certification', value: certification,
          value_norm: canonical(certification), is_required: chance(0.6) ? 1 : 0, weight: 1,
        });
      }
      for (const skill of profile.skills) {
        repos.jobRequirements.create(orgId, {
          job_id: job.id, kind: 'skill', value: skill,
          value_norm: canonical(skill), is_required: 0, weight: 0.5,
        });
      }
      const yearsNeeded = between(0, 3);
      if (yearsNeeded > 0) {
        repos.jobRequirements.create(orgId, {
          job_id: job.id, kind: 'experience', value: `${yearsNeeded} שנות ניסיון`,
          value_norm: `${yearsNeeded}`, is_required: 1, weight: 1,
        });
      }

      setJobTags(orgId, job.id, [profile.role.replace(/\s/g, '_'), client.city ?? ''].filter(Boolean));

      const requirements = repos.jobRequirements.list(orgId, { where: 'job_id = ?', params: [job.id] });
      db.run(
        'UPDATE jobs SET search_text = ? WHERE id = ? AND org_id = ?',
        normalize([job.title, job.city, job.description, ...requirements.map((r) => r.value)].join(' ')),
        job.id, orgId,
      );

      logActivity(orgId, {
        type: 'job.created',
        jobId: job.id,
        clientId: client.id,
        actorUserId: userId,
        summary: `נפתחה משרה: ${job.title}`,
      });
      return { ...job, profile };
    });

    /* ----------------------------- candidates ----------------------------- */
    const candidates = Array.from({ length: candidateCount }).map((_, index) => {
      const isFemale = chance(0.3);
      const firstName = isFemale ? pick(FIRST_NAMES_F) : pick(FIRST_NAMES_M);
      const lastName = pick(LAST_NAMES);
      const profile = pick(ROLE_PROFILES);
      const city = pick(CITIES);
      const years = between(0, 18);
      const currentSalary = between(profile.salary[0] - 1200, profile.salary[1] - 500);
      const createdDaysAgo = between(1, 180);

      const candidate = repos.candidates.create(orgId, {
        first_name: firstName,
        last_name: lastName,
        phone: normalizePhone(`05${between(20000000, 89999999)}`),
        whatsapp: null,
        email: chance(0.6) ? `user${index + 1}@example.com` : null,
        city,
        region: regionOfCity(city),
        current_role: profile.role,
        years_experience: years,
        education: pick(['תיכונית', 'תיכונית + בגרות', 'הנדסאי', 'תואר ראשון', 'קורס מקצועי']),
        current_salary: currentSalary,
        desired_salary: currentSalary + between(500, 2500),
        availability: pick(AVAILABILITIES),
        employment_type: pick(EMPLOYMENT),
        // Drivers have a licence and therefore a car; everyone else is mixed. Roughly a
        // third state a commute limit explicitly, as they do in real intake calls.
        has_car: profile.role.includes('נהג') || chance(0.45) ? 1 : 0,
        max_commute_km: chance(0.35) ? pick([15, 20, 25, 30, 40, 50, 60, 80]) : null,
        willing_to_relocate: chance(0.08) ? 1 : 0,
        source: pick(SOURCES),
        status_key: 'new',
        rating: chance(0.3) ? between(3, 5) : null,
        notes: chance(0.25) ? 'מחפש עבודה קרוב לבית. גמיש במשמרות.' : null,
        created_at: addDays(-createdDaysAgo),
        last_contact_at: chance(0.55) ? addDays(-between(0, createdDaysAgo)) : null,
      });
      result.candidates += 1;

      db.run(
        'UPDATE candidates SET whatsapp = phone WHERE id = ? AND org_id = ?',
        candidate.id, orgId,
      );

      const attributes = [
        ...profile.licenses.map((value) => ({ kind: 'license', value })),
        ...profile.certifications.map((value) => ({ kind: 'certification', value })),
        ...profile.skills.map((value) => ({ kind: 'skill', value })),
        { kind: 'language', value: 'עברית' },
      ];
      // Not everyone holds every credential — that variety is what makes matching meaningful.
      for (const attribute of attributes) {
        if (attribute.kind !== 'language' && chance(0.18)) continue;
        repos.candidateAttributes.create(orgId, {
          candidate_id: candidate.id,
          kind: attribute.kind,
          value: attribute.value,
          value_norm: canonical(attribute.value),
        });
      }

      const jobsHeld = between(1, 3);
      for (let position = 0; position < jobsHeld; position += 1) {
        const startYear = 2026 - years + position * 2;
        repos.candidateExperiences.create(orgId, {
          candidate_id: candidate.id,
          company: pick(CLIENT_SEEDS).name,
          title: position === 0 ? profile.role : pick(ROLE_PROFILES).role,
          start_date: String(Math.max(2008, startYear)),
          end_date: position === jobsHeld - 1 ? null : String(Math.max(2009, startYear + 2)),
          is_current: position === jobsHeld - 1 ? 1 : 0,
          sort_order: position,
        });
      }

      const tags = [profile.role.replace(/\s/g, '_')];
      if (candidate.availability === 'immediate') tags.push('זמין_מיידית');
      if ((candidate.desired_salary ?? 0) > profile.salary[1]) tags.push('שכר_גבוה');
      setCandidateTags(orgId, candidate.id, tags);

      const storedAttributes = repos.candidateAttributes.list(orgId, {
        where: 'candidate_id = ?', params: [candidate.id],
      });
      db.run(
        'UPDATE candidates SET search_text = ? WHERE id = ? AND org_id = ?',
        normalize(
          [firstName, lastName, candidate.phone, candidate.email, city, profile.role, candidate.education,
            ...storedAttributes.map((a) => a.value), ...tags].filter(Boolean).join(' '),
        ),
        candidate.id, orgId,
      );

      logActivity(orgId, {
        type: 'candidate.created',
        candidateId: candidate.id,
        actorUserId: userId,
        summary: `מועמד נוסף למאגר: ${firstName} ${lastName}`,
      });
      return { ...candidate, profile };
    });

    /* -------------------- applications, interviews, money -------------------- */
    const openJobs = jobs.filter((job) => job.status !== 'closed');
    const usedPairs = new Set<string>();

    for (const job of jobs) {
      const applicantCount = job.status === 'closed' ? between(3, 6) : between(0, 7);
      const pool = candidates.filter((candidate) => candidate.profile.role === job.profile.role);
      const fallback = pool.length >= applicantCount ? pool : candidates;

      for (let index = 0; index < applicantCount; index += 1) {
        const candidate = pick(fallback);
        const pairKey = `${candidate.id}:${job.id}`;
        if (usedPairs.has(pairKey)) continue;
        usedPairs.add(pairKey);

        // Later stages are rarer, which is what a real funnel looks like — except on a
        // closed job, where the first applicant is the hire that closed it.
        const roll = random();
        const stageIndex =
          index === 0 && job.status === 'closed'
            ? 7
            : roll < 0.28 ? 0 : roll < 0.48 ? 1 : roll < 0.62 ? 2 : roll < 0.74 ? 3
            : roll < 0.84 ? 4 : roll < 0.92 ? 5 : roll < 0.965 ? 6 : 7;
        const stageKey = PIPELINE_FLOW[stageIndex]!;
        const rejected = chance(0.12) && stageIndex > 1;
        const daysAgo = between(1, 40);

        const application = repos.applications.create(orgId, {
          candidate_id: candidate.id,
          job_id: job.id,
          stage_key: rejected ? 'rejected' : stageKey,
          status: rejected ? 'rejected' : 'active',
          source: candidate.source,
          match_score: between(48, 97),
          sent_to_client_at: stageIndex >= 5 ? addDays(-between(1, 6)) : null,
          client_feedback_at: stageIndex >= 6 ? addDays(-between(0, 3)) : null,
          stage_changed_at: addDays(-between(0, daysAgo)),
          created_at: addDays(-daysAgo),
        });
        result.applications += 1;

        db.run(
          'UPDATE candidates SET status_key = ? WHERE id = ? AND org_id = ?',
          rejected ? 'rejected' : stageKey, candidate.id, orgId,
        );

        logActivity(orgId, {
          type: 'application.created',
          candidateId: candidate.id,
          jobId: job.id,
          clientId: job.client_id,
          applicationId: application.id,
          actorUserId: userId,
          summary: `${candidate.first_name} ${candidate.last_name} שויך למשרה ${job.title}`,
        });

        if (stageIndex >= 4 && !rejected) {
          const past = chance(0.6);
          repos.interviews.create(orgId, {
            application_id: application.id,
            candidate_id: candidate.id,
            job_id: job.id,
            kind: stageIndex >= 6 ? 'client' : 'recruiter',
            scheduled_at: past ? addDays(-between(1, 12)) : addDays(between(0, 7)),
            duration_minutes: 45,
            location: stageIndex >= 6 ? job.city : 'שיחת טלפון',
            interviewer: stageIndex >= 6 ? 'נציג הלקוח' : 'אני',
            status: past ? 'completed' : 'scheduled',
            outcome: past ? pick(['passed', 'passed', 'failed']) : null,
            feedback: past ? pick(['רושם טוב, מוטיבציה גבוהה.', 'מקצועי, חסר ניסיון בציוד ספציפי.', 'מתאים — להעביר ללקוח.']) : null,
          });
          result.interviews += 1;

          logActivity(orgId, {
            type: past ? 'interview.completed' : 'interview.scheduled',
            candidateId: candidate.id,
            jobId: job.id,
            applicationId: application.id,
            actorUserId: userId,
            summary: past
              ? `הראיון עם ${candidate.first_name} הסתיים`
              : `נקבע ראיון ל${candidate.first_name} ${candidate.last_name}`,
          });
        }

        if (stageIndex >= 5) {
          const message = repos.messages.create(orgId, {
            channel: 'whatsapp',
            direction: 'out',
            candidate_id: candidate.id,
            job_id: job.id,
            to_address: candidate.phone,
            body: `היי ${candidate.first_name}, יש לי משרת ${job.profile.role} ב${job.city}. מעניין אותך?`,
            status: 'sent',
            provider: 'manual',
            sent_at: addDays(-between(1, 20)),
          });
          result.messages += 1;
          logActivity(orgId, {
            type: 'message.sent',
            candidateId: candidate.id,
            jobId: job.id,
            actorUserId: userId,
            summary: 'נשלחה הודעה (whatsapp)',
            meta: { channel: 'whatsapp', audience: 'candidate', message_id: message.id },
          });
        }

        // Hired candidates become a placement with a commission and a payment.
        if (stageIndex === 7 && job.client_id) {
          const startDate = dateOnly(addDays(-between(0, 60)));
          const salary = between(job.salary_min ?? 9000, job.salary_max ?? 13000);
          const feeAmount = calculateFee('percent', job.fee_value, salary, 'month');
          const client = clients.find((item) => item.id === job.client_id)!;

          const placement = repos.placements.create(orgId, {
            application_id: application.id,
            candidate_id: candidate.id,
            job_id: job.id,
            client_id: job.client_id,
            start_date: startDate,
            salary,
            fee_type: 'percent',
            fee_value: job.fee_value,
            fee_amount: feeAmount,
            currency: 'ILS',
            status: chance(0.15) ? 'completed' : 'guarantee',
            guarantee_days: 90,
            guarantee_until: dateOnly(addDays(90, startDate)),
            created_at: addDays(-between(0, 60)),
          });
          result.placements += 1;

          db.run(
            "UPDATE applications SET stage_key = 'started', status = 'placed' WHERE id = ? AND org_id = ?",
            application.id, orgId,
          );
          db.run(
            "UPDATE candidates SET status_key = 'started' WHERE id = ? AND org_id = ?",
            candidate.id, orgId,
          );

          const dueDate = dateOnly(addDays(client.payment_terms_days, startDate));
          const isPaid = chance(0.55);
          repos.payments.create(orgId, {
            placement_id: placement.id,
            client_id: job.client_id,
            amount: feeAmount,
            currency: 'ILS',
            status: isPaid ? 'paid' : new Date(dueDate) < new Date() ? 'overdue' : 'expected',
            due_date: dueDate,
            invoice_number: isPaid ? `INV-${between(1000, 9999)}` : null,
            paid_at: isPaid ? addDays(-between(0, 20)) : null,
            method: isPaid ? pick(['העברה בנקאית', 'צ׳ק']) : null,
          });
          result.payments += 1;

          logActivity(orgId, {
            type: 'placement.created',
            candidateId: candidate.id,
            jobId: job.id,
            clientId: job.client_id,
            placementId: placement.id,
            actorUserId: userId,
            summary: `השמה: ${candidate.first_name} ${candidate.last_name} → ${job.title} (₪${feeAmount.toLocaleString('he-IL')})`,
          });
        }
      }
    }

    /* -------------------------------- tasks -------------------------------- */
    const taskTemplates = [
      { title: 'להתקשר ל{name} — לא ענה להודעה', priority: 'high', offset: -1 },
      { title: 'לשלוח קורות חיים של {name} ללקוח', priority: 'high', offset: 0 },
      { title: 'לקבל פידבק מהלקוח על {name}', priority: 'urgent', offset: -2 },
      { title: 'לקבוע ראיון ל{name}', priority: 'normal', offset: 1 },
      { title: 'לבדוק ש{name} התחיל לעבוד', priority: 'normal', offset: 2 },
      { title: 'לעדכן פרטי שכר של {name}', priority: 'low', offset: 3 },
    ];

    for (let index = 0; index < 14; index += 1) {
      const candidate = pick(candidates);
      const template = pick(taskTemplates);
      const job = pick(openJobs.length ? openJobs : jobs);
      repos.tasks.create(orgId, {
        title: template.title.replace('{name}', `${candidate.first_name} ${candidate.last_name}`),
        due_at: addDays(template.offset + between(-1, 1)),
        priority: template.priority,
        status: index >= 11 ? 'done' : 'open',
        candidate_id: candidate.id,
        job_id: job.id,
        client_id: job.client_id,
        created_by: index % 4 === 0 ? 'automation' : 'user',
        completed_at: index >= 11 ? addDays(-1) : null,
      });
      result.tasks += 1;
    }

    db.run('UPDATE organizations SET onboarded_at = ? WHERE id = ?', nowIso(), orgId);

    return result;
  });
}

import { repos } from '../db/repos';
import { DEFAULT_STAGES } from './constants';
import { DEFAULT_AUTOMATIONS } from '../automations/defaults';

const STARTER_TAGS = [
  { name: 'זמין מיידית', color: 'emerald' },
  { name: 'שכר גבוה', color: 'amber' },
  { name: 'מומלץ', color: 'violet' },
];

/**
 * Everything a brand-new organisation needs to be usable on first login:
 * a pipeline, the default automation rules and a few starter tags.
 */
export function bootstrapOrganization(orgId: string): void {
  DEFAULT_STAGES.forEach((stage, index) => {
    repos.stages.create(orgId, {
      key: stage.key,
      label: stage.label,
      sort_order: index,
      color: stage.color,
      in_pipeline: stage.in_pipeline,
      is_terminal: stage.is_terminal,
      outcome: stage.outcome,
      is_system: 1,
    });
  });

  for (const automation of DEFAULT_AUTOMATIONS) {
    repos.automations.create(orgId, {
      key: automation.key,
      name: automation.name,
      description: automation.description,
      trigger_event: automation.trigger_event,
      conditions: JSON.stringify(automation.conditions ?? {}),
      action_type: automation.action_type,
      action_config: JSON.stringify(automation.action_config),
      delay_minutes: automation.delay_minutes,
      is_enabled: automation.is_enabled ? 1 : 0,
      is_system: 1,
    });
  }

  for (const tag of STARTER_TAGS) {
    repos.tags.create(orgId, { name: tag.name, color: tag.color });
  }
}

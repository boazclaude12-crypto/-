import { createRepository } from './repo';
import type {
  ActivityEventRow, ApplicationRow, AutomationRow, AutomationRunRow, CandidateAttributeRow,
  CandidateDocumentRow, CandidateExperienceRow, CandidateRow, ClientContactRow, ClientRow,
  EmailAccountRow, EmailMessageRow,
  InterviewRow, JobRequirementRow, JobRow, MessageRow, NoteRow, PaymentRow, PlacementRow,
  StageRow, TagRow, TaskRow,
} from '../types';

/** One org-scoped repository per table. Domain services build on these. */
export const repos = {
  stages: createRepository<StageRow>('stages', 'stg'),
  clients: createRepository<ClientRow>('clients', 'cli'),
  clientContacts: createRepository<ClientContactRow>('client_contacts', 'con'),
  candidates: createRepository<CandidateRow>('candidates', 'can'),
  candidateAttributes: createRepository<CandidateAttributeRow>('candidate_attributes', 'att'),
  candidateExperiences: createRepository<CandidateExperienceRow>('candidate_experiences', 'exp'),
  candidateDocuments: createRepository<CandidateDocumentRow>('candidate_documents', 'doc'),
  jobs: createRepository<JobRow>('jobs', 'job'),
  jobRequirements: createRepository<JobRequirementRow>('job_requirements', 'req'),
  applications: createRepository<ApplicationRow>('applications', 'app'),
  interviews: createRepository<InterviewRow>('interviews', 'int'),
  tasks: createRepository<TaskRow>('tasks', 'tsk'),
  messages: createRepository<MessageRow>('messages', 'msg'),
  notes: createRepository<NoteRow>('notes', 'not'),
  tags: createRepository<TagRow>('tags', 'tag'),
  placements: createRepository<PlacementRow>('placements', 'plc'),
  payments: createRepository<PaymentRow>('payments', 'pay'),
  automations: createRepository<AutomationRow>('automations', 'aut'),
  automationRuns: createRepository<AutomationRunRow>('automation_runs', 'run'),
  emailAccounts: createRepository<EmailAccountRow>('email_accounts', 'mbx'),
  emailMessages: createRepository<EmailMessageRow>('email_messages', 'eml'),
  activity: createRepository<ActivityEventRow>('activity_events', 'act'),
};

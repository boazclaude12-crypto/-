import type { AgentDeps } from './framework.js';
import { CompetitorAgent, IdeaAgent } from './idea.js';
import { FactCheckAgent, ResearchAgent } from './research.js';
import { RetentionAgent, ScriptAgent } from './script.js';
import { SceneAgent, VisualAgent, VoiceAgent } from './scene.js';
import { EditingAgent } from './editing.js';
import { QcAgent, SeoAgent, ThumbnailAgent } from './publish.js';
import { AnalyticsAgent, DecisionAgent, StrategyAgent } from './strategy.js';

export * from './framework.js';
export * from './prompts/library.js';
export { PROMPT_SEEDS, PROMPT_SEED_MAP } from './prompts/seed.js';
export * from './idea.js';
export * from './research.js';
export * from './script.js';
export * from './scene.js';
export * from './editing.js';
export * from './publish.js';
export * from './strategy.js';

/** The sixteen agents of spec §76, constructed once per process. */
export interface Agents {
  idea: IdeaAgent;
  competitor: CompetitorAgent;
  research: ResearchAgent;
  factCheck: FactCheckAgent;
  script: ScriptAgent;
  retention: RetentionAgent;
  scene: SceneAgent;
  visual: VisualAgent;
  voice: VoiceAgent;
  editing: EditingAgent;
  thumbnail: ThumbnailAgent;
  seo: SeoAgent;
  qc: QcAgent;
  analytics: AnalyticsAgent;
  strategy: StrategyAgent;
  decision: DecisionAgent;
}

export function buildAgents(deps: AgentDeps): Agents {
  return {
    idea: new IdeaAgent(deps),
    competitor: new CompetitorAgent(deps),
    research: new ResearchAgent(deps),
    factCheck: new FactCheckAgent(deps),
    script: new ScriptAgent(deps),
    retention: new RetentionAgent(deps),
    scene: new SceneAgent(deps),
    visual: new VisualAgent(deps),
    voice: new VoiceAgent(deps),
    editing: new EditingAgent(deps),
    thumbnail: new ThumbnailAgent(deps),
    seo: new SeoAgent(deps),
    qc: new QcAgent(deps),
    analytics: new AnalyticsAgent(deps),
    strategy: new StrategyAgent(deps),
    decision: new DecisionAgent(deps),
  };
}

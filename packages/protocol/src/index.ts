import { Type, Static } from '@sinclair/typebox';

/** Unique identifiers */
export const IdSchema = Type.String({ minLength: 1 });
export type Id = Static<typeof IdSchema>;

export const TimestampSchema = Type.String({ format: 'date-time' });
export type Timestamp = Static<typeof TimestampSchema>;

/** Multi-tenant namespace for memory isolation */
export const MemoryNamespaceSchema = Type.Object({
  tenantId: IdSchema,
  userId: IdSchema,
  taskId: Type.Optional(IdSchema),
  agentId: Type.Optional(IdSchema),
});
export type MemoryNamespace = Static<typeof MemoryNamespaceSchema>;

/** Correlation for distributed tracing & audit */
export const CorrelationSchema = Type.Object({
  correlationId: IdSchema,
  causationId: Type.Optional(IdSchema),
  traceId: Type.Optional(IdSchema),
});
export type Correlation = Static<typeof CorrelationSchema>;

/** Actor performing an action */
export const ActorSchema = Type.Object({
  type: Type.Union([
    Type.Literal('user'),
    Type.Literal('agent'),
    Type.Literal('system'),
  ]),
  id: IdSchema,
  displayName: Type.Optional(Type.String()),
});
export type Actor = Static<typeof ActorSchema>;

/** Agent definition */
export const AgentSchema = Type.Object({
  id: IdSchema,
  name: Type.String(),
  description: Type.Optional(Type.String()),
  modelId: Type.Optional(Type.String()),
  systemPrompt: Type.Optional(Type.String()),
  toolIds: Type.Array(Type.String()),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Agent = Static<typeof AgentSchema>;

/** Organizational hierarchy node */
export const OrgNodeSchema = Type.Object({
  id: IdSchema,
  name: Type.String({ minLength: 1 }),
  rank: Type.Integer({ minimum: 0 }),
  parentId: Type.Optional(IdSchema),
  sortOrder: Type.Integer({ minimum: 0 }),
  color: Type.Optional(Type.String()),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type OrgNode = Static<typeof OrgNodeSchema>;

export const OrgTreeNodeSchema = Type.Object({
  id: IdSchema,
  name: Type.String({ minLength: 1 }),
  rank: Type.Integer({ minimum: 0 }),
  parentId: Type.Optional(IdSchema),
  sortOrder: Type.Integer({ minimum: 0 }),
  color: Type.Optional(Type.String()),
  agents: Type.Array(
    Type.Object({
      id: IdSchema,
      name: Type.String(),
      enabled: Type.Boolean(),
    }),
  ),
  children: Type.Array(Type.Any()),
});
export type OrgTreeNode = Static<typeof OrgTreeNodeSchema>;

export const CreateOrgNodeSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  rank: Type.Optional(Type.Integer({ minimum: 0 })),
  parentId: Type.Optional(IdSchema),
  sortOrder: Type.Optional(Type.Integer({ minimum: 0 })),
  color: Type.Optional(Type.String()),
});
export type CreateOrgNodeInput = Static<typeof CreateOrgNodeSchema>;

export const UpdateOrgNodeSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  rank: Type.Optional(Type.Integer({ minimum: 0 })),
  parentId: Type.Union([IdSchema, Type.Null()]),
  sortOrder: Type.Optional(Type.Integer({ minimum: 0 })),
  color: Type.Optional(Type.String()),
});
export type UpdateOrgNodeInput = Static<typeof UpdateOrgNodeSchema>;

/** Independent AI secretary — not part of org hierarchy */
export const SecretaryTypeSchema = Type.Union([
  Type.Literal('time'),
  Type.Literal('personal'),
  Type.Literal('work'),
]);
export type SecretaryType = Static<typeof SecretaryTypeSchema>;

export const SecretaryPermissionsSchema = Type.Object({
  cron: Type.Optional(
    Type.Object({
      create: Type.Optional(Type.Boolean()),
      edit: Type.Optional(Type.Boolean()),
      delete: Type.Optional(Type.Boolean()),
      run: Type.Optional(Type.Boolean()),
    }),
  ),
});
export type SecretaryPermissions = Static<typeof SecretaryPermissionsSchema>;

export const SecretarySchema = Type.Object({
  id: IdSchema,
  name: Type.String({ minLength: 1 }),
  type: SecretaryTypeSchema,
  description: Type.Optional(Type.String()),
  systemPrompt: Type.Optional(Type.String()),
  color: Type.Optional(Type.String()),
  permissions: SecretaryPermissionsSchema,
  allowedTools: Type.Optional(Type.Array(Type.String())),
  allowedSkills: Type.Optional(Type.Array(Type.String())),
  enabled: Type.Boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Secretary = Static<typeof SecretarySchema>;

export const CreateSecretarySchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  type: SecretaryTypeSchema,
  description: Type.Optional(Type.String()),
  systemPrompt: Type.Optional(Type.String()),
  color: Type.Optional(Type.String()),
  permissions: Type.Optional(SecretaryPermissionsSchema),
  allowedTools: Type.Optional(Type.Array(Type.String())),
  allowedSkills: Type.Optional(Type.Array(Type.String())),
  enabled: Type.Optional(Type.Boolean()),
});
export type CreateSecretaryInput = Static<typeof CreateSecretarySchema>;

export const UpdateSecretarySchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  type: Type.Optional(SecretaryTypeSchema),
  description: Type.Optional(Type.String()),
  systemPrompt: Type.Optional(Type.String()),
  color: Type.Optional(Type.String()),
  permissions: Type.Optional(SecretaryPermissionsSchema),
  allowedTools: Type.Optional(Type.Array(Type.String())),
  allowedSkills: Type.Optional(Type.Array(Type.String())),
  enabled: Type.Optional(Type.Boolean()),
});
export type UpdateSecretaryInput = Static<typeof UpdateSecretarySchema>;

/** Persisted agent configuration */
export const StoredAgentSchema = Type.Object({
  id: IdSchema,
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  systemPrompt: Type.Optional(Type.String()),
  modelOverride: Type.Optional(Type.String()),
  enabled: Type.Boolean(),
  orgNodeId: Type.Optional(IdSchema),
  allowedTools: Type.Optional(Type.Array(Type.String())),
  allowedSkills: Type.Optional(Type.Array(Type.String())),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type StoredAgent = Static<typeof StoredAgentSchema>;

export const CreateAgentSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  systemPrompt: Type.Optional(Type.String()),
  modelOverride: Type.Optional(Type.String()),
  enabled: Type.Optional(Type.Boolean()),
  orgNodeId: Type.Optional(IdSchema),
  allowedTools: Type.Optional(Type.Array(Type.String())),
  allowedSkills: Type.Optional(Type.Array(Type.String())),
});
export type CreateAgentInput = Static<typeof CreateAgentSchema>;

export const UpdateAgentSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  description: Type.Optional(Type.String()),
  systemPrompt: Type.Optional(Type.String()),
  modelOverride: Type.Optional(Type.String()),
  enabled: Type.Optional(Type.Boolean()),
  orgNodeId: Type.Union([IdSchema, Type.Null()]),
  allowedTools: Type.Optional(Type.Array(Type.String())),
  allowedSkills: Type.Optional(Type.Array(Type.String())),
});
export type UpdateAgentInput = Static<typeof UpdateAgentSchema>;

/** Cron job definition */
export const CronJobSchema = Type.Object({
  id: IdSchema,
  name: Type.String({ minLength: 1 }),
  schedule: Type.String({ minLength: 1 }),
  message: Type.String({ minLength: 1 }),
  agentId: IdSchema,
  secretaryId: Type.Optional(IdSchema),
  enabled: Type.Boolean(),
  lastRun: Type.Optional(TimestampSchema),
  nextRun: Type.Optional(TimestampSchema),
  createdAt: TimestampSchema,
});
export type CronJob = Static<typeof CronJobSchema>;

export const CreateCronJobSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  schedule: Type.String({ minLength: 1 }),
  message: Type.String({ minLength: 1 }),
  agentId: IdSchema,
  secretaryId: Type.Optional(IdSchema),
  enabled: Type.Optional(Type.Boolean()),
});
export type CreateCronJobInput = Static<typeof CreateCronJobSchema>;

export const UpdateCronJobSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  schedule: Type.Optional(Type.String({ minLength: 1 })),
  message: Type.Optional(Type.String({ minLength: 1 })),
  agentId: Type.Optional(IdSchema),
  secretaryId: Type.Optional(IdSchema),
  enabled: Type.Optional(Type.Boolean()),
});
export type UpdateCronJobInput = Static<typeof UpdateCronJobSchema>;

/** MCP server configuration */
export const McpServerSchema = Type.Object({
  id: IdSchema,
  name: Type.String({ minLength: 1 }),
  command: Type.String({ minLength: 1 }),
  args: Type.Array(Type.String()),
  env: Type.Record(Type.String(), Type.String()),
  enabled: Type.Boolean(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type McpServer = Static<typeof McpServerSchema>;

export const CreateMcpServerSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  command: Type.String({ minLength: 1 }),
  args: Type.Optional(Type.Array(Type.String())),
  env: Type.Optional(Type.Record(Type.String(), Type.String())),
  enabled: Type.Optional(Type.Boolean()),
});
export type CreateMcpServerInput = Static<typeof CreateMcpServerSchema>;

export const UpdateMcpServerSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  command: Type.Optional(Type.String({ minLength: 1 })),
  args: Type.Optional(Type.Array(Type.String())),
  env: Type.Optional(Type.Record(Type.String(), Type.String())),
  enabled: Type.Optional(Type.Boolean()),
});
export type UpdateMcpServerInput = Static<typeof UpdateMcpServerSchema>;

/** Embedding provider configuration */
export const EmbeddingProviderTypeSchema = Type.Union([
  Type.Literal('stub'),
  Type.Literal('openai'),
]);
export type EmbeddingProviderType = Static<typeof EmbeddingProviderTypeSchema>;

export const EmbeddingConfigSchema = Type.Object({
  providerType: EmbeddingProviderTypeSchema,
  modelName: Type.String(),
  apiKey: Type.Optional(Type.String()),
});
export type EmbeddingConfig = Static<typeof EmbeddingConfigSchema>;

/** Session groups messages under a conversation */
export const SessionSchema = Type.Object({
  id: IdSchema,
  agentId: IdSchema,
  title: Type.String(),
  namespace: MemoryNamespaceSchema,
  status: Type.Union([
    Type.Literal('active'),
    Type.Literal('archived'),
    Type.Literal('closed'),
  ]),
  visibilityLevel: Type.Optional(Type.Integer({ minimum: 0 })),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Session = Static<typeof SessionSchema>;

/** Default org rank constants for RBAC */
export const ORG_RANK = {
  FOUNDER: 100,
  PARTNER: 80,
  DIRECTOR: 60,
  MANAGER: 50,
  STAFF: 10,
} as const;

/** Transcript message stored on a session for multi-turn context */
export const SessionMessageRoleSchema = Type.Union([
  Type.Literal('user'),
  Type.Literal('assistant'),
  Type.Literal('tool'),
  Type.Literal('system'),
]);
export type SessionMessageRole = Static<typeof SessionMessageRoleSchema>;

export const SessionMessageSchema = Type.Object({
  id: IdSchema,
  sessionId: IdSchema,
  role: SessionMessageRoleSchema,
  content: Type.String(),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  createdAt: TimestampSchema,
});
export type SessionMessage = Static<typeof SessionMessageSchema>;

/** Run lifecycle for agent execution */
export const RunStatusSchema = Type.Union([
  Type.Literal('pending'),
  Type.Literal('running'),
  Type.Literal('completed'),
  Type.Literal('failed'),
  Type.Literal('cancelled'),
]);
export type RunStatus = Static<typeof RunStatusSchema>;

export const RunSchema = Type.Object({
  id: IdSchema,
  sessionId: IdSchema,
  agentId: IdSchema,
  status: RunStatusSchema,
  input: Type.Unknown(),
  output: Type.Optional(Type.Unknown()),
  error: Type.Optional(Type.String()),
  correlation: CorrelationSchema,
  startedAt: Type.Optional(TimestampSchema),
  completedAt: Type.Optional(TimestampSchema),
  createdAt: TimestampSchema,
});
export type Run = Static<typeof RunSchema>;

/** Memory record types */
export const MemoryKindSchema = Type.Union([
  Type.Literal('working'),
  Type.Literal('episodic'),
  Type.Literal('semantic'),
]);
export type MemoryKind = Static<typeof MemoryKindSchema>;

export const MemoryRecordSchema = Type.Object({
  id: IdSchema,
  kind: MemoryKindSchema,
  namespace: MemoryNamespaceSchema,
  content: Type.String(),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  embedding: Type.Optional(Type.Array(Type.Number())),
  createdAt: TimestampSchema,
  expiresAt: Type.Optional(TimestampSchema),
});
export type MemoryRecord = Static<typeof MemoryRecordSchema>;

/** Base domain event envelope */
export const DomainEventTypeSchema = Type.Union([
  Type.Literal('run.created'),
  Type.Literal('run.started'),
  Type.Literal('run.completed'),
  Type.Literal('run.failed'),
  Type.Literal('run.cancelled'),
  Type.Literal('model.request'),
  Type.Literal('model.response'),
  Type.Literal('agent.message'),
  Type.Literal('tool.invoked'),
  Type.Literal('tool.completed'),
  Type.Literal('tool.failed'),
  Type.Literal('memory.staged'),
  Type.Literal('memory.committed'),
  Type.Literal('audit.recorded'),
  Type.Literal('session.created'),
  Type.Literal('session.updated'),
]);
export type DomainEventType = Static<typeof DomainEventTypeSchema>;

export const DomainEventSchema = Type.Object({
  id: IdSchema,
  type: DomainEventTypeSchema,
  aggregateId: IdSchema,
  aggregateType: Type.String(),
  payload: Type.Unknown(),
  correlation: CorrelationSchema,
  actor: ActorSchema,
  occurredAt: TimestampSchema,
  version: Type.Integer({ minimum: 1 }),
});
export type DomainEvent = Static<typeof DomainEventSchema>;

/** Audit-specific projection event (redaction-friendly) */
export const AuditEventSchema = Type.Object({
  id: IdSchema,
  action: Type.String(),
  resourceType: Type.String(),
  resourceId: IdSchema,
  actor: ActorSchema,
  correlation: CorrelationSchema,
  payload: Type.Record(Type.String(), Type.Unknown()),
  redactedFields: Type.Array(Type.String()),
  occurredAt: TimestampSchema,
  sequence: Type.Integer({ minimum: 0 }),
  previousHash: Type.Optional(Type.String()),
  hash: Type.String(),
});
export type AuditEvent = Static<typeof AuditEventSchema>;

/** Tool invocation contract */
export const ToolInvocationSchema = Type.Object({
  toolId: Type.String(),
  input: Type.Unknown(),
  policyContext: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
export type ToolInvocation = Static<typeof ToolInvocationSchema>;

/** Auth/permission interfaces (not hardcoded in UI) */
export interface PermissionChecker {
  can(actor: Actor, action: string, resource: string): Promise<boolean>;
}

export interface FeatureFlags {
  isEnabled(flag: string, context?: Record<string, unknown>): boolean;
}

/** Health check response */
export const HealthResponseSchema = Type.Object({
  status: Type.Union([Type.Literal('ok'), Type.Literal('degraded'), Type.Literal('down')]),
  version: Type.String(),
  uptime: Type.Number(),
  services: Type.Record(Type.String(), Type.Union([
    Type.Literal('ok'),
    Type.Literal('degraded'),
    Type.Literal('down'),
  ])),
});
export type HealthResponse = Static<typeof HealthResponseSchema>;

/** LLM provider configuration */
export const LlmProviderTypeSchema = Type.Union([
  Type.Literal('stub'),
  Type.Literal('openai'),
  Type.Literal('anthropic'),
  Type.Literal('custom'),
]);
export type LlmProviderType = Static<typeof LlmProviderTypeSchema>;

export const LlmProviderConfigSchema = Type.Object({
  providerType: LlmProviderTypeSchema,
  baseUrl: Type.String(),
  modelName: Type.String({ minLength: 1 }),
  apiKey: Type.Optional(Type.String()),
});
export type LlmProviderConfig = Static<typeof LlmProviderConfigSchema>;

export const LlmProviderConfigPublicSchema = Type.Object({
  providerType: LlmProviderTypeSchema,
  baseUrl: Type.String(),
  modelName: Type.String({ minLength: 1 }),
  hasApiKey: Type.Boolean(),
});
export type LlmProviderConfigPublic = Static<typeof LlmProviderConfigPublicSchema>;

/** Agent skill capability package */
export const SkillSourceSchema = Type.Union([
  Type.Literal('inline'),
  Type.Literal('path'),
]);
export type SkillSource = Static<typeof SkillSourceSchema>;

export const SkillSchema = Type.Object({
  id: IdSchema,
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  enabled: Type.Boolean(),
  source: SkillSourceSchema,
  content: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type Skill = Static<typeof SkillSchema>;

export const CreateSkillSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  source: SkillSourceSchema,
  content: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
  enabled: Type.Optional(Type.Boolean()),
});
export type CreateSkillInput = Static<typeof CreateSkillSchema>;

export const UpdateSkillSchema = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  description: Type.Optional(Type.String()),
  enabled: Type.Optional(Type.Boolean()),
  content: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
});
export type UpdateSkillInput = Static<typeof UpdateSkillSchema>;

export function createCorrelation(partial?: Partial<Correlation>): Correlation {
  const id = crypto.randomUUID();
  return {
    correlationId: partial?.correlationId ?? id,
    causationId: partial?.causationId,
    traceId: partial?.traceId ?? id,
  };
}

export function createActor(
  type: Actor['type'],
  id: string,
  displayName?: string,
): Actor {
  return { type, id, displayName };
}

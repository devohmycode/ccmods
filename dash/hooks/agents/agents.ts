/**
 * The custom subagents the session can hand a message to: the person's own
 * (`~/.claude/agents`) and the project's (`.claude/agents`). The plugins'
 * agents are left out: a session can carry dozens of them.
 *
 * They come from the context breakdown the engine computes for `/context`,
 * whose summary is local and free; built-in agents are not in it. Picking
 * one puts its mention, `@agent-<type>`, at the head of the prompt box: the
 * person's next message goes to it, and nothing leaves until they send it.
 */

/** Where an agent was defined. */
export type AgentScope = 'user' | 'project'

/** One subagent the pane offers. */
export type AgentEntry = {
  /** Its type, as the Agent tool and a mention name it. */
  type: string
  scope: AgentScope
}

/** The order the groups are listed in. */
export const AGENT_SCOPES: readonly AgentScope[] = ['user', 'project']

const SOURCES: Readonly<Record<string, AgentScope>> = {
  userSettings: 'user',
  projectSettings: 'project',
  localSettings: 'project',
}

/**
 * The scope of a definition's source, by the engine's word for it.
 *
 * @param source `userSettings`, `projectSettings`, `plugin`, ...
 * @returns its scope, or `undefined` for a source the pane does not list
 */
export function scopeOf(source: string): AgentScope | undefined {
  return SOURCES[source]
}

/**
 * The agents to offer: listed sources only, once each, grouped by scope
 * then sorted by type.
 *
 * @param agents the breakdown's agents
 * @returns the entries
 */
export function agentsOf(agents: readonly { agentType: string; source: string }[]): AgentEntry[] {
  const seen = new Set<string>()
  const entries: AgentEntry[] = []

  for (const one of agents) {
    const scope = scopeOf(one.source)

    if (scope !== undefined && one.agentType !== '' && !seen.has(one.agentType)) {
      seen.add(one.agentType)
      entries.push({ type: one.agentType, scope })
    }
  }

  return entries.sort(
    (a, b) => AGENT_SCOPES.indexOf(a.scope) - AGENT_SCOPES.indexOf(b.scope) || a.type.localeCompare(b.type),
  )
}

/**
 * The mention that hands a message to an agent.
 *
 * @param type the agent's type
 * @returns `@agent-<type>`
 */
export const mentionOf = (type: string): string => `@agent-${type}`

/**
 * The prompt box once an agent is picked: its mention at the head, in place
 * of one already there, and the draft kept after it.
 *
 * @param draft the prompt box as it stands
 * @param type the agent picked
 * @returns the new draft
 */
export function draftWith(draft: string, type: string): string {
  const rest = draft.replace(/^\s*@agent-\S+\s*/, '')

  return `${mentionOf(type)} ${rest}`
}

/**
 * The agent a draft is addressed to, if it opens with a mention.
 *
 * @param draft the prompt box as it stands
 * @returns the agent's type, or `undefined`
 */
export function mentionedIn(draft: string): string | undefined {
  return /^\s*@agent-(\S+)/.exec(draft)?.[1]
}

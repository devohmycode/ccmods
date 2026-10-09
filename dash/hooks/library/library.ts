/**
 * The person's own library: the custom subagents, slash commands and skills,
 * each defined either for every project (`~/.claude/…`) or for this one
 * (`.claude/…`). The plugins' and the built-in ones are left out: a session
 * can carry dozens of them, and they are not the person's to pick from here.
 *
 * The agents come from the context breakdown; the commands and the skills
 * from their folders, since `$.command.list()` names a person's command
 * `user` whether it is global or the project's. A pick puts the name at the
 * head of the prompt box, and nothing leaves until the person sends it.
 */

import type { AgentScope } from '../agents'

/**
 * The kinds the pane lists, in the order drawn: the person's library, then
 * the session's setup (plugins, MCP servers, settings hooks).
 */
export type LibraryKind = 'agents' | 'commands' | 'skills' | 'plugins' | 'mcp' | 'hooks'

/** The kinds a click turns on or off, through `/plugin` or `/mcp`. */
export type ToggleKind = 'plugins' | 'mcp'

/** The kinds, in the order the pane draws them. */
export const LIBRARY_KINDS: readonly LibraryKind[] = ['agents', 'commands', 'skills', 'plugins', 'mcp', 'hooks']

/** Each kind's color: its header, its frame and its two inner frames. */
export const LIBRARY_COLORS: Readonly<Record<LibraryKind, string>> = {
  agents: '#39c5cf',
  commands: '#f0883e',
  skills: '#a3e635',
  plugins: '#c084fc',
  mcp: '#60a5fa',
  hooks: '#f472b6',
}

/** The key that opens or closes each section, in keyboard mode. */
export const LIBRARY_HOTKEYS: Readonly<Record<LibraryKind, string>> = {
  agents: 'a',
  commands: 'c',
  skills: 's',
  plugins: 'p',
  mcp: 'm',
  hooks: 'h',
}

/**
 * Whether a click on that kind's entry turns it on or off.
 *
 * @param kind the kind
 * @returns true for plugins and MCP servers
 */
export const isToggleKind = (kind: LibraryKind): kind is ToggleKind => kind === 'plugins' || kind === 'mcp'

/** One entry the pane lists. */
export type LibraryEntry = {
  /** What the person types it by: the agent's type, the command's, skill's, plugin's or server's name, the hook's event. */
  name: string
  scope: AgentScope
  /** A plugin's or a server's state: enabled or not. */
  isOn?: boolean
  /** How many hooks run on that event. */
  count?: number
}

/** Everything the pane lists, by kind. */
export type Library = Record<LibraryKind, LibraryEntry[]>

/** A library with nothing in it. */
export const EMPTY_LIBRARY: Library = { agents: [], commands: [], skills: [], plugins: [], mcp: [], hooks: [] }

/** A settings value read from one source, with the scope it counts for. */
export type Sourced = readonly [AgentScope, unknown]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const byScopeThenName = (a: LibraryEntry, b: LibraryEntry): number =>
  (a.scope === b.scope ? 0 : a.scope === 'user' ? -1 : 1) || a.name.localeCompare(b.name)

/**
 * The plugins `enabledPlugins` names, from the lowest source to the highest:
 * the last source that names one sets its state and its scope.
 *
 * @param sources each source's `enabledPlugins`, lowest first
 * @returns the entries, global first, then sorted
 */
export function pluginsOf(sources: readonly Sourced[]): LibraryEntry[] {
  const found = new Map<string, LibraryEntry>()

  for (const [scope, enabled] of sources) {
    for (const [name, isOn] of Object.entries(isRecord(enabled) ? enabled : {})) {
      if (typeof isOn === 'boolean') {
        found.set(name, { name, scope, isOn })
      }
    }
  }

  return [...found.values()].sort(byScopeThenName)
}

/**
 * The events the settings hook, each with how many hooks run on it.
 *
 * @param sources each source's `hooks`
 * @returns one entry per event and scope, global first, then sorted
 */
export function hooksOf(sources: readonly Sourced[]): LibraryEntry[] {
  const found = new Map<string, LibraryEntry>()

  for (const [scope, hooks] of sources) {
    for (const [event, groups] of Object.entries(isRecord(hooks) ? hooks : {})) {
      const count = (Array.isArray(groups) ? groups : []).reduce<number>(
        (sum, group) => sum + (isRecord(group) && Array.isArray(group['hooks']) ? group['hooks'].length : 0),
        0,
      )
      const key = `${scope}:${event}`

      if (count > 0) {
        found.set(key, { name: event, scope, count: (found.get(key)?.count ?? 0) + count })
      }
    }
  }

  return [...found.values()].sort(byScopeThenName)
}

/**
 * The MCP servers: the connected ones, the configured ones and the disabled
 * ones, each once, on unless disabled.
 *
 * @param servers `connected` (from the context breakdown), `user` and
 *   `project` (the configured names), `disabled` (the project's)
 * @returns the entries, global first, then sorted
 */
export function mcpOf(servers: {
  connected: readonly string[]
  user: readonly string[]
  project: readonly string[]
  disabled: readonly string[]
}): LibraryEntry[] {
  const names = new Set([...servers.connected, ...servers.user, ...servers.project, ...servers.disabled])

  return [...names]
    .map(name => ({
      name,
      scope: servers.project.includes(name) ? ('project' as const) : ('user' as const),
      isOn: !servers.disabled.includes(name),
    }))
    .sort(byScopeThenName)
}

/**
 * A server's name as `/mcp` takes it: the breakdown spells a claude.ai
 * connector as its tools do, `claude_ai_Claude_Docs`, which `/mcp` does not find.
 *
 * @param name the breakdown's server name
 * @returns `claude.ai Claude Docs`; any other name as it is
 */
export function serverNameOf(name: string): string {
  // ponytail: underscores read as spaces, a connector whose name has an underscore of its own comes out wrong
  return name.startsWith('claude_ai_') ? `claude.ai ${name.slice('claude_ai_'.length).replace(/_/g, ' ')}` : name
}

/**
 * The project's entry in the engine's state file: its keys are the folder
 * with forward slashes, on Windows a drive letter in either case.
 *
 * @param state the state file, parsed
 * @param cwd the session's folder
 * @returns the project's settings, or an empty one
 */
export function projectStateOf(state: unknown, cwd: string): Record<string, unknown> {
  const projects = isRecord(state) && isRecord(state['projects']) ? state['projects'] : {}
  const wanted = cwd.replace(/\\/g, '/').toLowerCase()
  const key = Object.keys(projects).find(one => one.replace(/\\/g, '/').toLowerCase() === wanted)
  const found = key === undefined ? undefined : projects[key]

  return isRecord(found) ? found : {}
}

/**
 * A file's JSON, or nothing where it does not parse.
 *
 * @param text the file's text
 * @returns the value
 */
export function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/**
 * The keys of an object, or none.
 *
 * @param value anything
 * @returns its keys where it is an object
 */
export const keysOf = (value: unknown): string[] => (isRecord(value) ? Object.keys(value) : [])

/**
 * The strings of an array, or none.
 *
 * @param value anything
 * @returns its strings where it is an array
 */
export const stringsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []

/**
 * What turns a plugin or a server the other way: for a plugin the CLI,
 * `claude plugin disable x@y`, since `/plugin` opens its dialog and waits on
 * Esc; for a server `/mcp disable x`, which answers in one line.
 *
 * @param kind `plugins` or `mcp`
 * @param entry the entry clicked
 * @returns the process to run, or the slash command and its arguments
 */
export function toggleCommandOf(
  kind: ToggleKind,
  entry: LibraryEntry,
): { argv: string[] } | { command: string; args: string } {
  const verb = entry.isOn === false ? 'enable' : 'disable'

  return kind === 'plugins' ? { argv: ['claude', 'plugin', verb, entry.name] } : { command: 'mcp', args: `${verb} ${entry.name}` }
}

/** How many entries each scope's frame shows until it is expanded. */
export const ENTRIES_SHOWN = 3

/**
 * The entries a scope's frame draws: the first {@link ENTRIES_SHOWN} until
 * the person expands it, all of them after.
 *
 * @param entries the kind's entries
 * @param scope the frame's scope
 * @param isExpanded whether the person expanded that frame
 * @returns the entries to draw, how many the frame leaves out, and how many it has
 */
export function shownOf<T extends { scope: AgentScope }>(
  entries: readonly T[],
  scope: AgentScope,
  isExpanded: boolean,
): { shown: T[]; hidden: number; count: number } {
  const inScope = entries.filter(one => one.scope === scope)
  const shown = isExpanded ? inScope : inScope.slice(0, ENTRIES_SHOWN)

  return { shown, hidden: inScope.length - shown.length, count: inScope.length }
}

/**
 * A command's name from its file under `commands/`: a subfolder is a
 * namespace, `git/commit.md` → `git:commit`.
 *
 * @param path the file's path under `commands/`, `/`-separated
 * @returns the name, or `undefined` for a file that is not Markdown
 */
export function commandNameOf(path: string): string | undefined {
  if (!path.toLowerCase().endsWith('.md')) {
    return undefined
  }

  const name = path.slice(0, -3).split('/').filter(Boolean).join(':')

  return name === '' ? undefined : name
}

/**
 * The entries of one scope, each name once, sorted.
 *
 * @param names the names found
 * @param scope where they were found
 * @returns the entries
 */
export function entriesOf(names: readonly string[], scope: AgentScope): LibraryEntry[] {
  return [...new Set(names)].sort((a, b) => a.localeCompare(b)).map(name => ({ name, scope }))
}

/**
 * The prompt box once a command or a skill is picked: `/<name>` at the head,
 * in place of one already there, and the draft kept after it.
 *
 * @param draft the prompt box as it stands
 * @param name the command or skill picked
 * @returns the new draft
 */
export function draftWithCommand(draft: string, name: string): string {
  const rest = draft.replace(/^\s*\/\S+\s*/, '')

  return `/${name} ${rest}`
}

/**
 * The command a draft opens with, if any.
 *
 * @param draft the prompt box as it stands
 * @returns its name, without the slash, or `undefined`
 */
export function invokedIn(draft: string): string | undefined {
  return /^\s*\/(\S+)/.exec(draft)?.[1]
}

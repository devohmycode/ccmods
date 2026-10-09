/**
 * Switch: a pane that lists the models, the effort levels and the presets
 * that set both, and switches any of them with one click.
 *
 * A click runs the engine's own command, `/model <alias>` or
 * `/effort <level>`, as if the person typed it: the session's setting
 * changes, the status line follows, and nothing of the mod stands between
 * the session and its model. Where the session has no `/effort`, the mod
 * holds the level and writes it on each main request at `turn.step`.
 *
 * The current values come from the requests themselves: every main
 * `turn.step` carries the model and the effort the engine resolved for it,
 * after any downgrade, so the pane shows what was sent, not what was asked.
 * Its result carries the usage the pane prices a switch with.
 */

import type { ConfigRow, ConfigValue, EngineInterface, FsEntry, PromptBox, PromptFilled, Register, SettingsSource } from 'claude-code'

import { agentsOf, draftWith, mentionOf, mentionedIn } from './agents'
import type { AgentScope } from './agents'
import {
  MORE_MODELS,
  cappedScriptOf,
  fastStateOf,
  choiceOf,
  effortOf,
  idleReasonOf,
  pickOf,
  planOf,
  presetText,
  savedEffortOf,
  switchedText,
} from './catalog'
import type { Effort, Pick } from './catalog'
import { catalogOf, isOwnPreset, presetPartOf, withoutPreset } from './config'
import type { Catalog, PresetDraft } from './config'
import { LONG_TTL_MS, WARM_MS, costSuffixOf, measureOf, switchCostOf } from './cost'
import type { LastRequest, SwitchCost } from './cost'
import {
  EMPTY_LIBRARY,
  commandNameOf,
  draftWithCommand,
  entriesOf,
  hooksOf,
  invokedIn,
  isToggleKind,
  jsonOf,
  keysOf,
  mcpOf,
  pluginsOf,
  projectStateOf,
  serverNameOf,
  stringsOf,
  toggleCommandOf,
} from './library'
import type { Library, LibraryKind, Sourced } from './library'
import { COMMAND, NEW_PRESET_KEY, PANE_ID } from './names'
import { drawBand, drawPane } from './pane'
import { LANGUAGES, say, setSay } from './say'
import {
  BAND_PARTS,
  DEFAULT_PREFS,
  PREF_KEYS,
  bandOf,
  prefKeyOf,
  prefsLines,
  prefsOf,
  setRequestOf,
  stateFileOf,
  withPref,
} from './settings'
import type { BandPart, Prefs } from './settings'
import { USAGE_TICK_MS, usageViewOf } from './usage'

/**
 * The calls the buttons make after the render that drew them has returned,
 * captured from `engine.create`.
 */
type Host = {
  invalidate: () => void
  model: () => Promise<string>
  run: (command: string, args: string) => Promise<unknown>
  toast: (text: string, timeoutMs?: number) => void
  later: (fn: () => void) => void
  after: (ms: number, fn: () => void) => { cancel: () => void }
  now: () => Promise<number>
  read: () => Promise<PromptBox>
  fill: (text: string) => Promise<PromptFilled>
  list: (path: string) => Promise<FsEntry[]>
  exists: (path: string) => Promise<boolean>
  save: (prefs: Prefs) => Promise<unknown>
  settings: (source: SettingsSource) => Promise<Record<string, unknown>>
  file: (path: string) => Promise<string>
  cwd: () => Promise<string>
  exec: (argv: readonly string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  setConfig: (key: string, value: ConfigValue) => Promise<{ value?: unknown; deny?: string }>
}

/** The settings sources the setup is read from, lowest first, each with its scope. */
const SETUP_SOURCES: readonly [AgentScope, SettingsSource][] = [
  ['user', 'user'],
  ['project', 'project'],
  ['project', 'local'],
]

/**
 * Where the person's own definitions and the engine's state file live;
 * unreadable variables leave the global folders out, not the pane.
 *
 * @param $ the engine
 * @returns the `.claude` folder and the state file, where known
 */
async function pathsOf($: EngineInterface): Promise<{ configDir: string | undefined; stateFile: string | undefined }> {
  const home =
    (await $.env.get('USERPROFILE').catch(() => undefined)) ?? (await $.env.get('HOME').catch(() => undefined))
  const custom = await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined)

  return { configDir: custom ?? (home === undefined ? undefined : `${home}/.claude`), stateFile: stateFileOf(home, custom) }
}

/**
 * The settings the mod's store keeps, each missing one at its default.
 *
 * @param $ the engine
 * @returns the settings
 */
async function storedPrefsOf($: EngineInterface): Promise<Prefs> {
  return prefsOf(await $.store.get('settings').catch(() => undefined))
}

/** How deep a commands folder's namespaces are followed. */
const COMMANDS_DEPTH = 3

/** How long a switch's notification stays, in milliseconds. */
const TOAST_MS = 5000

/**
 * Registers `/dash`, its pane, and the `turn.step` hook that keeps the
 * pane's values current. Each switch that takes is announced by a toast
 * naming the values before and after; one that fails, by its reason.
 *
 * The settings come from the mod's store, read at `session.start` and
 * rewritten by `/dash set`; the manifest declares none, so installing
 * the mod asks nothing.
 *
 * @param on the module's hook registrar
 */
export const register: Register = on => {
  let prefs: Prefs = DEFAULT_PREFS
  let catalog: Catalog = catalogOf(prefs)

  /**
   * Puts the settings in force: the language, then the catalog they name.
   *
   * @param next the settings
   */
  const settle = (next: Prefs): void => {
    prefs = next
    setSay(prefs.language)
    catalog = catalogOf(prefs)
  }

  settle(prefs)

  let host: Host | undefined
  let model: string | undefined
  let effort: Effort | undefined
  // The level a click asked for where the session has no /effort: the mod
  // writes it on each main request instead.
  let held: Effort | undefined
  let hasEffortCommand = true
  // The model and level the engine itself last sent, before the mod's: when
  // the level moves under the same model, the person ran /effort, and their
  // level wins over the held one. A new model brings its own default level.
  let engineSeen: { model: string; effort: string | number | undefined } | undefined
  let hasFast = false
  // Fast mode's state, from the last /fast output; unknown until one runs.
  let isFast: boolean | undefined
  // Ultracode lasts the session and no hook reads it: the mod keeps what it
  // last asked, off at the start.
  let isUltracode = false
  // Whether the paths and the lists were read: a module reloaded mid-session
  // gets no session.start, and its first draw reads them instead.
  let isRead = false
  // Whether the settings were read from the store: a module reloaded
  // mid-session reads them on its first draw, the band's or the pane's.
  let isPrefsRead = false
  // True from a click on an effort until a main request carries a level:
  // till then the pane shows what was asked, not what was sent.
  let isEffortAsked = false
  // The last main request, measured, and the timers that redraw the pane
  // when its cache crosses 5 minutes, then 1 hour.
  let last: LastRequest | undefined
  let expiry: { cancel: () => void }[] = []
  // The redraw that ages the Session frame's durations, armed by a draw.
  let tick: { cancel: () => void } | undefined
  // The person's agents, commands and skills, read at session.start and
  // again each time /dash opens the pane.
  let library: Library = EMPTY_LIBRARY
  // Where the person's own definitions live (`~/.claude`), read at session.start.
  let configDir: string | undefined
  // The engine's state file (`.claude.json`), read at session.start and on each open.
  let stateFile: string | undefined
  // True from a plugin's toggle until `/reload-plugins` has run.
  let isReloadPending = false
  // The MCP servers with tools in the context, from the last breakdown.
  let connected: string[] = []
  // What the prompt box opens with, by kind: read when /dash opens the pane
  // and set by a pick, never by the render, which must not wait on the box.
  let current: Partial<Record<LibraryKind, string>> = {}
  // The sections the person opened and the scope frames they expanded
  // (`<kind>:<scope>`), for the life of the module.
  const openKinds = new Set<LibraryKind>()
  const expandedFrames = new Set<string>()
  // The session's name, once /rename gave one, and whether its field is
  // open again to change it: a named session shows the name, not the field.
  let sessionName: string | undefined
  let isRenaming = false
  // Whether /compact waits for its confirmation: a stray click summarizes
  // the conversation for good.
  let isCompactAsked = false
  // The instructions typed for it, passed on as `/compact <instructions>`.
  let compactNote = ''
  // The preset the person is composing in the pane.
  let draftPreset: PresetDraft = { name: '', model: '', effort: '' }
  // The drop-downs the person opened, by key.
  const openMenus = new Set<string>()

  /**
   * The commands or the skills defined under one `.claude` folder.
   *
   * @param kind `commands` (Markdown files, a subfolder a namespace) or `skills` (folders with a SKILL.md)
   * @param base the `.claude` folder
   * @returns their names; none where the folder is missing
   */
  const namesIn = async (kind: 'commands' | 'skills', base: string): Promise<string[]> => {
    const h = host

    if (h === undefined) {
      return []
    }

    if (kind === 'skills') {
      const dirs = await h.list(`${base}/skills`).catch(() => [])
      const found = await Promise.all(
        dirs
          .filter(one => one.kind === 'dir' || one.isLink)
          .map(async one => ((await h.exists(`${base}/skills/${one.name}/SKILL.md`).catch(() => false)) ? one.name : '')),
      )

      return found.filter(name => name !== '')
    }

    const names: string[] = []
    const walk = async (path: string, depth: number): Promise<void> => {
      for (const one of await h.list(`${base}/commands${path}`).catch(() => [])) {
        if (one.kind === 'dir' && depth < COMMANDS_DEPTH) {
          await walk(`${path}/${one.name}`, depth + 1)
        } else if (one.kind === 'file') {
          const name = commandNameOf(`${path}/${one.name}`)

          if (name !== undefined) {
            names.push(name)
          }
        }
      }
    }

    await walk('', 0)

    return names
  }

  /**
   * Reads the library again: the agents from the breakdown, the commands
   * and the skills from the global and the project's folders.
   *
   * @param agents the breakdown's agents, or `undefined` to keep the last ones
   */
  const readLibrary = async (agents: readonly { agentType: string; source: string }[] | undefined): Promise<void> => {
    const roots: [AgentScope, string | undefined][] = [
      ['user', configDir],
      ['project', '.claude'],
    ]
    const read = async (kind: 'commands' | 'skills') =>
      (
        await Promise.all(
          roots.map(async ([scope, base]) => (base === undefined ? [] : entriesOf(await namesIn(kind, base), scope))),
        )
      ).flat()

    library = {
      ...library,
      agents: agents === undefined ? library.agents : agentsOf(agents).map(one => ({ name: one.type, scope: one.scope })),
      commands: await read('commands'),
      skills: await read('skills'),
    }
  }

  /**
   * Reads the setup again: the plugins and the hooks from the settings
   * sources, the MCP servers from the breakdown, the state file and `.mcp.json`.
   *
   * @param mcpTools the breakdown's MCP tools, or `undefined` to keep the last servers
   */
  const readSetup = async (mcpTools: readonly { serverName: string }[] | undefined): Promise<void> => {
    const h = host

    if (h === undefined) {
      return
    }

    connected = mcpTools === undefined ? connected : mcpTools.map(one => serverNameOf(one.serverName))
    const sources = await Promise.all(
      SETUP_SOURCES.map(async ([scope, source]) => [scope, await h.settings(source).catch((): Record<string, unknown> => ({}))] as const),
    )
    const state = jsonOf(stateFile === undefined ? '' : await h.file(stateFile).catch(() => ''))
    const project = projectStateOf(state, await h.cwd().catch(() => ''))
    const mcpJson = jsonOf(await h.file('.mcp.json').catch(() => '')) as { mcpServers?: unknown } | undefined
    const of = (key: string): Sourced[] => sources.map(([scope, settings]) => [scope, settings[key]])

    library = {
      ...library,
      plugins: pluginsOf(of('enabledPlugins')),
      hooks: hooksOf(of('hooks')),
      mcp: mcpOf({
        connected,
        user: keysOf((state as { mcpServers?: unknown } | undefined)?.mcpServers),
        project: [...keysOf(project['mcpServers']), ...keysOf(mcpJson?.mcpServers)],
        disabled: [...stringsOf(project['disabledMcpServers']), ...stringsOf(project['disabledMcpjsonServers'])],
      }),
    }
  }

  /**
   * Turns a plugin or an MCP server the other way through the engine's own
   * command, `/plugin enable|disable` or `/mcp enable|disable`.
   *
   * @param kind `plugins` or `mcp`
   * @param name the entry clicked
   * @returns once the command has run and the pane redrawn
   */
  const toggleEntry = async (kind: 'plugins' | 'mcp', name: string): Promise<void> => {
    const entry = library[kind].find(one => one.name === name)

    if (host === undefined || entry === undefined) {
      return
    }

    const toggle = toggleCommandOf(kind, entry)

    if ('argv' in toggle) {
      const { exitCode, stdout, stderr } = await host.exec(toggle.argv)

      if (exitCode !== 0) {
        throw new Error((stderr || stdout).trim())
      }
    } else {
      await host.run(toggle.command, toggle.args)
    }

    const isOn = entry.isOn === false
    isReloadPending ||= kind === 'plugins'
    library = { ...library, [kind]: library[kind].map(one => (one === entry ? { ...one, isOn } : one)) }
    host.toast(kind === 'plugins' ? say().pluginToggled(name, isOn) : say().serverToggled(name, isOn), TOAST_MS)
    host.invalidate()
  }

  /**
   * Puts a pick at the head of the prompt box, the draft kept after it: an
   * agent's mention, which hands it the next message, or `/<name>` for a
   * command or a skill. Nothing is sent.
   *
   * @param kind what was picked
   * @param name its name
   * @returns once the box is filled and the person told
   */
  const pickEntry = async (kind: LibraryKind, name: string): Promise<void> => {
    if (isToggleKind(kind)) {
      return toggleEntry(kind, name)
    }

    if (host === undefined || kind === 'hooks') {
      return
    }

    const box = await host.read()
    const isAgent = kind === 'agents'
    const filled = await host.fill(isAgent ? draftWith(box.text, name) : draftWithCommand(box.text, name))

    current = filled.isFilled ? { [kind]: name } : current
    host.toast(
      filled.isFilled ? (isAgent ? say().agentPut(mentionOf(name)) : say().commandPut(`/${name}`)) : say().agentNotPut,
      TOAST_MS,
    )
    host.invalidate()
  }

  /**
   * Tells the person a switch did not take, the command's reason in it.
   *
   * @param error what the command rejected with
   */
  const failed = (error: unknown): void => {
    host?.toast(`${say().failed} ${error instanceof Error ? error.message : String(error)}`, TOAST_MS)
  }

  /**
   * What a switch would cost right now.
   *
   * @returns the cost, none known before the clock answers
   */
  const costNow = async (): Promise<SwitchCost> => {
    const now = await host?.now().catch(() => undefined)

    return now === undefined ? { state: 'none' } : switchCostOf(last, now)
  }

  /**
   * Records the last main request and re-arms the redraws at the cache's
   * two thresholds, so the pane's cost line ages without a request.
   *
   * @param request the request just answered
   */
  const recordRequest = (request: LastRequest): void => {
    last = request

    for (const timer of expiry) {
      timer.cancel()
    }

    expiry = host === undefined ? [] : [WARM_MS, LONG_TTL_MS].map(ms => host!.after(ms, host!.invalidate))
  }

  /**
   * The name the toasts give the current model.
   *
   * @returns its label, or its id for a model the pane does not offer
   */
  const modelName = (): string | undefined => choiceOf(model, catalog.models)?.label ?? model

  /**
   * Applies a pick: `/model` first where the model changes, then `/effort`
   * (or the held level) where the level does, and one toast for both. A
   * pick that would change nothing runs nothing and says so.
   *
   * @param pick a model, a level or a preset
   * @returns once the commands have run and the pane redrawn
   */
  const apply = async (pick: Pick): Promise<void> => {
    if (host === undefined) {
      return
    }

    const idle = idleReasonOf(pick, model, effort, catalog.models)

    if (idle !== undefined) {
      host.toast(idle, TOAST_MS)

      return
    }

    const plan = planOf(pick, model, effort, catalog.models)
    const cost = await costNow()
    const moves: [string | undefined, string][] = []
    let kind: 'model' | 'effort' = 'model'

    if (plan.model !== undefined) {
      const before = modelName()
      const target = plan.model

      await host.run('model', target.arg)
      model = await host.model().catch(() => target.arg)
      moves.push([before, modelName() ?? target.label])
    }

    if (plan.effort !== undefined) {
      if (hasEffortCommand) {
        await host.run('effort', plan.effort)
      } else {
        held = plan.effort
      }

      moves.push([effort, plan.effort])
      kind = plan.model === undefined ? 'effort' : kind
      effort = plan.effort
      isEffortAsked = true
    }

    host.invalidate()

    const [before, after] = moves[0] ?? [undefined, '']
    const text = 'preset' in pick ? presetText(pick.preset, moves) : switchedText(kind, before, after)

    host.toast(text + costSuffixOf(cost), TOAST_MS)
  }

  /**
   * Runs `/fast`, the engine's own toggle; the pane cannot read its state.
   *
   * @returns once the command has run
   */
  const toggleFast = async (): Promise<void> => {
    const ran = (await host?.run('fast', '')) as { text?: string } | undefined
    isFast = fastStateOf(ran?.text) ?? isFast
    host?.invalidate()
  }

  /**
   * Turns ultracode on or off through `/effort`, the level kept as it is.
   *
   * @param isOn the state asked; the other one of the mod's where omitted
   * @returns once the command has run and the pane redrawn
   */
  const setUltracode = async (isOn = !isUltracode): Promise<void> => {
    if (host === undefined) {
      return
    }

    // Set before the command runs, so a second press while it runs flips back.
    const was = isUltracode
    isUltracode = isOn

    try {
      await host.run('effort', isOn ? 'ultracode' : 'ultracode off')
    } catch (error) {
      isUltracode = was
      throw error
    } finally {
      host.invalidate()
    }

    host.toast(`${say().ultracode} ${isOn ? say().ultracodeOn : say().ultracodeOff}`, TOAST_MS)
  }

  /**
   * Renames the session through `/rename`.
   *
   * @param name the name typed; an empty one does nothing
   * @returns once the command has run
   */
  const renameSession = async (name: string): Promise<void> => {
    const trimmed = name.trim()

    if (host === undefined || trimmed === '') {
      return
    }

    await host.run('rename', trimmed)
    sessionName = trimmed
    isRenaming = false
    host.toast(say().renamed(trimmed), TOAST_MS)
    host.invalidate()
  }

  /**
   * Changes one `/config` row as the menu would; a refusal is told.
   *
   * @param key the row's key
   * @param value its new value
   * @returns once written and the pane redrawn
   */
  const setConfig = async (key: string, value: ConfigValue): Promise<void> => {
    if (host === undefined) {
      return
    }

    const { deny } = await host.setConfig(key, value)

    if (deny !== undefined) {
      host.toast(`${say().configRefused} ${deny}`, TOAST_MS)
    }

    host.invalidate()
  }

  /**
   * Adds the preset composed in the pane to the `presets` setting.
   *
   * @returns once saved and the pane redrawn, or the refusal told
   */
  const addPreset = async (): Promise<void> => {
    if (host === undefined) {
      return
    }

    const draft = { ...draftPreset, model: draftPreset.model || (catalog.models[0]?.key ?? '') }
    const made = presetPartOf(draft, catalog.models, catalog.presets)

    if ('error' in made) {
      host.toast(made.error === 'exists' ? say().presetExists : say().presetBadName, TOAST_MS)

      return
    }

    const set = withPref(prefs, 'presets', prefs.presets.trim() === '' ? made.part : `${prefs.presets}, ${made.part}`)

    if ('error' in set) {
      return
    }

    settle(set.prefs)
    await host.save(set.prefs)
    draftPreset = { name: '', model: draft.model, effort: draft.effort }
    openMenus.delete(NEW_PRESET_KEY)
    host.toast(`${say().presetAdded} ${made.part}`, TOAST_MS)
    host.invalidate()
  }

  /**
   * Deletes a preset of the person's own from the `presets` setting.
   *
   * @param key the preset's name
   * @returns once saved and the pane redrawn
   */
  const deletePreset = async (key: string): Promise<void> => {
    if (host === undefined || !isOwnPreset(key, DEFAULT_PREFS.presets)) {
      return
    }

    // An empty setting would read as the default: keep the shipped ones then.
    const rest = withoutPreset(prefs.presets, key)
    const set = withPref(prefs, 'presets', rest === '' ? DEFAULT_PREFS.presets : rest)

    if ('error' in set) {
      return
    }

    settle(set.prefs)
    await host.save(set.prefs)
    host.toast(`${say().presetDeleted} ${key}`, TOAST_MS)
    host.invalidate()
  }

  /**
   * Shows or hides the pane's hotkeys, kept with the settings.
   *
   * @returns once saved and the pane redrawn
   */
  const toggleKeyboard = async (): Promise<void> => {
    const set = withPref(prefs, 'keyboard', prefs.keyboard === 'off' ? 'on' : 'off')

    if ('error' in set || host === undefined) {
      return
    }

    settle(set.prefs)
    await host.save(set.prefs)
    host.invalidate()
  }

  /**
   * Folds the pane's lists onto their current row, or unfolds them, kept
   * with the settings.
   *
   * @returns once saved and the pane redrawn
   */
  const toggleCompact = async (): Promise<void> => {
    const set = withPref(prefs, 'compact', prefs.compact === 'off' ? 'on' : 'off')

    if ('error' in set || host === undefined) {
      return
    }

    settle(set.prefs)
    await host.save(set.prefs)
    host.invalidate()
  }

  /**
   * Puts a frame's values in the band above the prompt, or takes them out,
   * kept with the settings; the toast says which.
   *
   * @param part the frame's values
   * @returns once saved and the pane and the band redrawn
   */
  const toggleBand = async (part: BandPart): Promise<void> => {
    const band = bandOf(prefs.band)
    const isIn = !band.includes(part)
    const set = withPref(prefs, 'band', BAND_PARTS.filter(one => (one === part ? isIn : band.includes(one))).join(','))

    if ('error' in set || host === undefined) {
      return
    }

    settle(set.prefs)
    await host.save(set.prefs)
    const title = { model: say().models, effort: say().efforts, session: say().session }[part]
    host.toast(`${title} ${isIn ? say().bandPut : say().bandTaken}`, TOAST_MS)
    host.invalidate()
  }

  /**
   * Asks for `/compact`, or drops the question, from the pane or the band.
   *
   * @param isAsked whether it is asked
   */
  const askCompact = (isAsked: boolean): void => {
    isCompactAsked = isAsked
    compactNote = ''
    host?.invalidate()
  }

  /** Runs `/compact` with the instructions typed, once confirmed. */
  const compact = (): void => {
    const note = compactNote.trim()
    isCompactAsked = false
    compactNote = ''
    host?.invalidate()
    void host?.run('compact', note).catch(failed)
  }

  /**
   * Switches to a model of the drop-down, which the rows may not hold.
   *
   * @param id its id
   * @returns once the switch has run
   */
  const pickMoreModel = async (id: string): Promise<void> => {
    const known = MORE_MODELS.find(one => one.id === id)

    if (known === undefined) {
      return
    }

    await apply({
      model: {
        key: id,
        label: known.label,
        arg: id,
        hasEffort: !id.includes('haiku'),
        color: choiceOf(id, catalog.models)?.color ?? '#888888',
      },
    })
  }

  on('engine.create', async (_$, e, next) => {
    const beneath = await next(e)

    host ??= {
      invalidate: () => beneath.ui.invalidate('ui.render'),
      model: () => beneath.session.model(),
      run: (command, args) => beneath.command.run({ command, args }),
      toast: (text, timeoutMs) => beneath.ui.toast(text, { timeoutMs }),
      later: fn => void beneath.clock.after(0, fn),
      after: (ms, fn) => beneath.clock.after(ms, fn),
      now: () => beneath.clock.now(),
      read: () => beneath.prompt.read(),
      fill: text => beneath.prompt.fill({ text }),
      list: path => beneath.fs.list(path),
      exists: path => beneath.fs.exists(path),
      save: kept => beneath.store.set('settings', kept),
      // Async, so an engine without the noun rejects instead of throwing.
      settings: async source => (await beneath.settings.read({ source })) as Record<string, unknown>,
      file: async path => String(await beneath.fs.read(path)),
      cwd: async () => beneath.session.cwd(),
      exec: argv => beneath.process.run(argv),
      setConfig: async (key, value) => (await beneath.config.set({ key, value })) as { value?: unknown; deny?: string },
    }

    return beneath
  })

  on('session.start', async ($, e, next) => {
    // Before the command is registered: its description is in the language.
    settle(await storedPrefsOf($))
    isPrefsRead = true

    await $.command.register({
      name: COMMAND,
      description: say().description,
      argumentHint: say().argumentHint,
    })

    const started = await next(e)

    model = await $.session.model().catch(() => undefined)

    const commands = await $.command.list().catch(() => [])
    hasEffortCommand = commands.some(one => one.name === 'effort')
    hasFast = commands.some(one => one.name === 'fast')

    effort ??= savedEffortOf(await $.settings.read().catch(() => ({})), model, catalog.models)

    ;({ configDir, stateFile } = await pathsOf($))

    // The summary breakdown is local and free; the agents and the MCP tools are in it.
    const usage = await $.session.usage({ breakdown: 'summary' }).catch(() => undefined)
    await readLibrary(usage?.context.breakdown?.agents ?? [])
    await readSetup(usage?.context.breakdown?.mcpTools ?? [])

    return started
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const request = setRequestOf(e.args)

    if (request !== undefined) {
      if (request.key === undefined) {
        return { text: [say().settingsTitle, ...prefsLines(prefs)].join('\n') }
      }

      const key = prefKeyOf(request.key)

      if (key === undefined) {
        return { text: `${say().settingUnknown} ${PREF_KEYS.join(', ')}` }
      }

      const set = withPref(prefs, key, request.value ?? '')

      if ('error' in set) {
        const refusals = {
          maxAgents: say().settingBadMaxAgents,
          keyboard: say().settingBadKeyboard,
          compact: say().settingBadCompact,
          band: say().settingBadBand,
          language: `${say().settingBadLanguage} ${Object.keys(LANGUAGES).join(', ')}`,
        }

        return { text: refusals[set.error] }
      }

      await $.store.set('settings', set.prefs)
      settle(set.prefs)
      $.ui.invalidate('ui.render')

      const lines = [`${say().settingSaved} ${key}`, ...prefsLines(prefs)]

      return { text: catalog.ignored.length === 0 ? lines.join('\n') : [...lines, `${say().ignored} ${catalog.ignored.join(', ')}`].join('\n') }
    }

    const ultracode = /^ultracode(?:\s+(on|off))?$/i.exec(e.args.trim())

    if (ultracode !== null && hasEffortCommand) {
      if (host === undefined) {
        return { text: say().notReady }
      }

      const isOn = ultracode[1]?.toLowerCase() !== 'off'
      host.later(() => void setUltracode(isOn).catch(failed))

      return { text: `${say().ultracodeSet} ${isOn ? say().ultracodeOn : say().ultracodeOff}` }
    }

    const pick = pickOf(e.args, catalog.models, catalog.presets)

    if (pick === undefined && e.args.trim() !== '') {
      return { text: `${say().unknownPick} ${e.args.trim()}` }
    }

    if (pick !== undefined) {
      const idle = idleReasonOf(pick, model, effort, catalog.models)

      if (idle !== undefined) {
        return { text: idle }
      }

      if (host === undefined) {
        return { text: say().notReady }
      }

      // `/model` and `/effort` cannot run from inside this hook: the session
      // waits on it. A timer runs them once `/dash` has answered.
      host.later(() => void apply(pick).catch(failed))

      if ('model' in pick) {
        return { text: `${say().modelSet} ${pick.model.label}` }
      }

      return 'effort' in pick
        ? { text: `${say().effortSet} ${pick.effort}` }
        : { text: `${say().presetSet} ${pick.preset.key}` }
    }

    ;({ configDir, stateFile } = await pathsOf($))
    isRead = true

    // A file added since the session began shows on the next open.
    const usage = await $.session.usage({ breakdown: 'summary' }).catch(() => undefined)
    await readLibrary(usage?.context.breakdown?.agents)
    await readSetup(usage?.context.breakdown?.mcpTools)
    const draft = (await $.prompt.read().catch(() => ({ text: '' }))).text
    current = { agents: mentionedIn(draft), commands: invokedIn(draft), skills: invokedIn(draft) }

    await $.ui.open({ id: PANE_ID, title: say().paneTitle, focus: true })

    return { text: say().opened }
  })

  // A /rename the person types names the session too.
  on('command.run', { command: 'rename' }, async ($, e, next) => {
    const result = await next(e)
    sessionName = e.args.trim() || sessionName
    isRenaming = false
    $.ui.invalidate('ui.render')

    return result
  })

  // A /fast the person types says the new state too.
  on('command.run', { command: 'fast' }, async ($, e, next) => {
    const result = await next(e)
    isFast = fastStateOf(result.text) ?? isFast
    $.ui.invalidate('ui.render')

    return result
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) {
      return yield* next(e)
    }

    if (engineSeen?.model === e.model && e.effort !== undefined && e.effort !== engineSeen.effort) {
      held = undefined
    }

    engineSeen = { model: e.model, effort: e.effort ?? engineSeen?.effort }

    const sent = held !== undefined && e.effort !== undefined ? { ...e, effort: held } : e
    const seen = effortOf(sent.effort) ?? effort
    const isSeen = effortOf(sent.effort) !== undefined

    if (sent.model !== model || seen !== effort || (isEffortAsked && isSeen)) {
      model = sent.model
      effort = seen
      isEffortAsked &&= !isSeen
      $.ui.invalidate('ui.render')
    }

    const result = yield* next(sent)
    const measure = measureOf(result.usage)

    if (measure !== undefined) {
      recordRequest({ ...measure, at: await $.clock.now() })
      $.ui.invalidate('ui.render')
    }

    return result
  })

  // The agent cap: a workflow's agents pass no hook (agent.spawn sees only
  // the Agent tool's), so the cap goes into the script itself. A script on
  // disk is read and sent inline; one run by name cannot be reached and is
  // refused, as is any the cap cannot be fitted into: the cap fails closed.
  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    if (prefs.maxAgents === '') {
      return next(e)
    }

    const args = e as unknown as Record<string, unknown>
    const path = args['scriptPath']
    const script =
      typeof path === 'string'
        ? String(await $.fs.read(path).catch(() => ''))
        : typeof args['script'] === 'string'
          ? args['script']
          : undefined

    if (script === undefined) {
      return { deny: say().capNamed(prefs.maxAgents) }
    }

    const capped = cappedScriptOf(script, Number(prefs.maxAgents))

    if (capped === undefined) {
      return { deny: say().capUnfit(prefs.maxAgents) }
    }

    const { scriptPath: _path, ...rest } = args

    return next({ ...rest, script: capped } as unknown as typeof e)
  })

  // The durations count in minutes: one redraw a minute ages them while the
  // pane or the band draws them, and stops with them, since a site not drawn
  // re-arms none.
  const armTick = (): void => {
    tick ??= host?.after(USAGE_TICK_MS, () => {
      tick = undefined
      host?.invalidate()
    })
  }

  // The band above the prompt: the values the pane's ↧ buttons put there.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // A module reloaded mid-session starts blank: no session.start comes again.
    if (!isPrefsRead) {
      isPrefsRead = true
      settle(await storedPrefsOf($))
    }

    const band = bandOf(prefs.band)

    if (band.length === 0 || e.props.hasSurvey) {
      return next(e)
    }

    model ??= await $.session.model().catch(() => undefined)
    effort ??= savedEffortOf(await $.settings.read().catch(() => ({})), model, catalog.models)
    const sessionUsage = band.includes('session') ? await $.session.usage().catch(() => undefined) : undefined
    const context = sessionUsage?.context
    const now = await $.clock.now().catch(() => undefined)

    if (band.includes('session')) {
      armTick()
    }

    return drawBand($.ui.resolve(e), {
      band,
      models: catalog.models,
      model,
      effort,
      context: context === undefined ? undefined : { percent: context.percent, tokens: context.tokens, window: context.window },
      usage: sessionUsage === undefined || now === undefined ? undefined : usageViewOf(sessionUsage, now),
      isCompactAsked,
      askCompact,
      compact,
    }, e.surface)
  })

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    // A module reloaded mid-session starts blank: no session.start comes again.
    if (!isPrefsRead) {
      isPrefsRead = true
      settle(await storedPrefsOf($))
    }

    model ??= await $.session.model().catch(() => undefined)
    effort ??= savedEffortOf(await $.settings.read().catch(() => ({})), model, catalog.models)

    // Nor are the lists read: the first draw reads them, as /dash would.
    if (!isRead) {
      isRead = true
      ;({ configDir, stateFile } = await pathsOf($))
      const usage = await $.session.usage({ breakdown: 'summary' }).catch(() => undefined)
      await readLibrary(usage?.context.breakdown?.agents ?? [])
      await readSetup(usage?.context.breakdown?.mcpTools ?? [])
    }

    // Both cheap, read on each draw: the gauge follows every request, which
    // redraws the pane, and a row changed in /config shows on the next draw.
    const sessionUsage = await $.session.usage().catch(() => undefined)
    const context = sessionUsage?.context
    const now = await $.clock.now().catch(() => undefined)
    const configRows: ConfigRow[] = await $.config.list().catch(() => [])

    armTick()

    return drawPane($.ui.resolve(e), {
      context: context === undefined ? undefined : { percent: context.percent, tokens: context.tokens, window: context.window },
      usage: sessionUsage === undefined || now === undefined ? undefined : usageViewOf(sessionUsage, now),
      renameSession: name => void renameSession(name).catch(failed),
      sessionName,
      isRenaming,
      editName: () => {
        isRenaming = true
        host?.invalidate()
      },
      isCompactAsked,
      askCompact,
      compactNote,
      setCompactNote: note => {
        compactNote = note
      },
      compact,
      configRows,
      setConfig: (key, value) => void setConfig(key, value).catch(failed),
      models: catalog.models,
      presets: catalog.presets,
      model,
      effort,
      hasEffortCommand,
      isEffortAsked,
      hasFast,
      isFast,
      isUltracode,
      ignored: catalog.ignored,
      pickModel: key => {
        const choice = catalog.models.find(one => one.key === key)

        if (choice !== undefined) {
          void apply({ model: choice }).catch(failed)
        }
      },
      pickEffort: level => void apply({ effort: level }).catch(failed),
      pickPreset: key => {
        const preset = catalog.presets.find(one => one.key === key)

        if (preset !== undefined) {
          void apply({ preset }).catch(failed)
        }
      },
      toggleFast: () => void toggleFast().catch(failed),
      toggleUltracode: () => void setUltracode().catch(failed),
      pickMoreModel: id => void pickMoreModel(id).catch(failed),
      isKeyboard: prefs.keyboard !== 'off',
      toggleKeyboard: () => void toggleKeyboard().catch(failed),
      isCompact: prefs.compact === 'on',
      toggleCompact: () => void toggleCompact().catch(failed),
      band: bandOf(prefs.band),
      toggleBand: part => void toggleBand(part).catch(failed),
      library,
      current,
      openKinds: [...openKinds],
      toggleKind: kind => {
        if (!openKinds.delete(kind)) {
          openKinds.add(kind)
        }

        host?.invalidate()
      },
      expandedFrames: [...expandedFrames],
      toggleFrame: (kind, scope) => {
        if (!expandedFrames.delete(`${kind}:${scope}`)) {
          expandedFrames.add(`${kind}:${scope}`)
        }

        host?.invalidate()
      },
      pickEntry: (kind, name) => void pickEntry(kind, name).catch(failed),
      openMenus: [...openMenus],
      draftPreset: { ...draftPreset, model: draftPreset.model || (catalog.models[0]?.key ?? '') },
      setDraftPreset: patch => {
        draftPreset = { ...draftPreset, ...patch }
        host?.invalidate()
      },
      addPreset: () => void addPreset().catch(failed),
      ownPresets: catalog.presets.filter(one => isOwnPreset(one.key, DEFAULT_PREFS.presets)).map(one => one.key),
      deletePreset: key => void deletePreset(key).catch(failed),
      toggleMenu: key => {
        if (!openMenus.delete(key)) {
          openMenus.add(key)
        }

        host?.invalidate()
      },
      isReloadPending,
      reloadPlugins: () =>
        void host
          ?.run('reload-plugins', '')
          .then(() => {
            isReloadPending = false
            host?.invalidate()
          })
          .catch(failed),
    }, e.surface)
  })
}

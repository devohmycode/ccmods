import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { MockClock } from 'claude-code/testing'

import {
  CONFIG_KEY,
  NEW_PRESET_KEY,
  PRESET_ADD_KEY,
  PRESET_EFFORT_KEY,
  PRESET_MODEL_KEY,
  PRESET_NAME_KEY,
  presetDeleteKey,
  EN,
  RENAME_KEY,
  COMPACT_KEY,
  COMPACT_CONFIRM_KEY,
  COMPACT_CANCEL_KEY,
  COMPACT_NOTE_KEY,
  COMPACT_MODE_KEY,
  BAND_COMPACT_KEY,
  BAND_COMPACT_CONFIRM_KEY,
  bandKey,
  configKey,
  FAST_KEY,
  MORE_MODELS_KEY,
  menuOptionKey,
  PANE_ID,
  ULTRACODE_KEY,
  effortKey,
  entryKey,
  frameToggleKey,
  modelKey,
  presetKey,
  sectionKey,
  USAGE_COLORS,
} from '../hooks'

/** What the host saw: the commands run on it, `/name args`, the toasts, and its store. */
type World = { runs: string[]; toasts: string[]; clock: MockClock; store: Map<string, unknown> }

/**
 * A host whose session runs Opus at high, with the commands it is given.
 *
 * @param on the test plugin's registrar
 * @param commands the commands `command.list` names besides `/model`
 * @param failing a command whose run rejects
 * @returns what the host saw
 */
function host(on: On, commands: string[] = ['effort'], failing?: string): World {
  const world: World = { runs: [], toasts: [], clock: mock.clock(on), store: new Map() }
  let model = 'claude-opus-5-5'

  on('store.get', ($, e) => ({ value: world.store.get(e.key) }))
  on('store.set', ($, e) => {
    world.store.set(e.key, e.value)

    return { value: undefined }
  })

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.toast', ($, e) => {
    world.toasts.push(String((e as { text?: string }).text))

    return { value: undefined }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('command.list', () => ({
    value: ['model', ...commands].map(name => ({ name, description: '', source: 'builtin' })) as never,
  }))
  // The model's own level wins over the top-level one.
  on('settings.read', () => ({
    value: { effortLevel: 'low', modelSettings: { 'claude-opus-5-5': { effortLevel: 'high' } } },
  }))
  on('session.model', () => ({ value: model }))
  const runs = (command: string, args: string) => {
    if (command === failing) {
      throw new Error(`/${command} refused`)
    }

    world.runs.push(`/${command} ${args}`.trimEnd())

    if (command === 'model') {
      model = args.startsWith('claude-') ? args : `claude-${args}-5-5`
    }

    return { text: '' }
  }

  on('command.run', { command: 'model' }, ($, e) => runs(e.command, e.args))
  on('command.run', { command: 'effort' }, ($, e) => runs(e.command, e.args))
  on('command.run', { command: 'fast' }, ($, e) => runs(e.command, e.args))

  return world
}

/**
 * A main step that answers at once with that usage.
 *
 * @param on the test plugin's registrar
 * @param usage what the step reports, or null
 */
function answers(on: On, usage: unknown = null): void {
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage } as never
  })
}

/**
 * Drains one main step.
 *
 * @param $ the test's engine
 * @param effort the level the engine resolved
 */
async function step($: { turn: { step: (e: never) => AsyncIterable<unknown> } }, effort = 'high'): Promise<void> {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort, messageCount: 1 } as never)

  for await (const _chunk of stream) {
    // drained
  }
}

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } } as const
const SESSION = { cwd: '/work', surface: 'terminal', isInteractive: true } as const
const PANE = {
  title: EN.paneTitle,
  isFocused: false,
  bodyColumns: 80,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 24 },
  view: {},
} as const
const MOUNT = { plugin: 'dash', surface: 'terminal', component: 'Pane', requestId: PANE_ID, props: PANE } as const
const BAND = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 160, scroll: { offset: 0, bodyRows: 10 }, view: {} } as const
const BAND_MOUNT = { plugin: 'dash', surface: 'terminal', component: 'AbovePrompt', props: BAND } as const

describe('/dash', () => {
  test('the pane marks the current model with its version, and a click runs /model and /effort', async ($, on) => {
    const world = host(on)
    await $.session.start(SESSION)

    const ui = await $.ui.mount(MOUNT)

    expect((await ui.find({ key: `row:${modelKey('opus')}` }))?.text).toMatch(/^●.*Opus 5\.5/)
    expect((await ui.find({ key: `row:${modelKey('sonnet')}` }))?.text).toMatch(/^○/)
    expect((await ui.find({ key: `row:${effortKey('high')}` }))?.text).toMatch(/^●/)

    await ui.press({ key: modelKey('sonnet') })
    await ui.press({ key: effortKey('max') })
    await ui.redraw(PANE)

    expect(world.runs).toEqual(['/model sonnet', '/effort max'])
    expect(world.toasts).toEqual(['⇄ Model Opus → Sonnet', '⚡ Effort high → max'])
    expect((await ui.find({ key: `row:${modelKey('sonnet')}` }))?.text).toMatch(/^●.*Sonnet 5\.5/)
    expect((await ui.find({ key: `row:${effortKey('max')}` }))?.text).toMatch(/^●/)

    await ui.unmount()
  })

  test('typed with a name, it switches without the pane; anything else is refused', async ($, on) => {
    const world = host(on)
    await $.session.start(SESSION)

    const run = (args: string) => $.command.run({ command: 'dash', args, ...RUN })

    expect((await run('sonnet')).text).toContain('Sonnet')
    expect((await run('low')).text).toContain('low')
    expect((await run('turbo')).text).toContain('turbo')

    await world.clock.settle()
    expect(world.toasts).toEqual(['⇄ Model Opus → Sonnet', '⚡ Effort high → low'])
    expect(world.runs).toEqual(['/model sonnet', '/effort low'])
  })

  test('a preset sets the model and the level in one go, and only what changes', async ($, on) => {
    const world = host(on)
    await $.session.start(SESSION)

    const run = (args: string) => $.command.run({ command: 'dash', args, ...RUN })

    expect((await run('deep')).text).toBe(`${EN.presetSet} deep`)
    await world.clock.settle()
    expect(world.runs).toEqual(['/effort xhigh'])

    await run('daily')
    await world.clock.settle()
    expect(world.runs).toEqual(['/effort xhigh', '/model sonnet', '/effort medium'])
    expect(world.toasts.at(-1)).toBe('◇ Preset daily: Opus → Sonnet, xhigh → medium')

    expect((await run('daily')).text).toBe('◇ Preset daily: already on Sonnet · medium')

    const ui = await $.ui.mount(MOUNT)

    expect((await ui.find({ key: `row:${presetKey('daily')}` }))?.text).toMatch(/^●/)

    await ui.press({ key: presetKey('quick') })
    await world.clock.settle()
    expect(world.runs.at(-1)).toBe('/model haiku')

    await ui.unmount()
  })

  test('a pick of the current model or level runs nothing, typed or clicked', async ($, on) => {
    const world = host(on)
    await $.session.start(SESSION)

    expect((await $.command.run({ command: 'dash', args: 'opus', ...RUN })).text).toBe('⇄ Model already on Opus')
    expect((await $.command.run({ command: 'dash', args: 'high', ...RUN })).text).toBe('⚡ Effort already on high')

    const ui = await $.ui.mount(MOUNT)
    await ui.press({ key: modelKey('opus') })
    await ui.press({ key: effortKey('high') })
    await world.clock.settle()

    expect(world.runs).toEqual([])
    expect(world.toasts).toEqual(['⇄ Model already on Opus', '⚡ Effort already on high'])

    await ui.unmount()
  })

  test('under Haiku, no effort runs and the levels are not buttons', async ($, on) => {
    const world = host(on)
    await $.session.start(SESSION)

    await $.command.run({ command: 'dash', args: 'haiku', ...RUN })
    await world.clock.settle()

    expect((await $.command.run({ command: 'dash', args: 'low', ...RUN })).text).toBe(EN.noEffort)

    const ui = await $.ui.mount(MOUNT)

    expect(await ui.find({ key: effortKey('low') })).toBeUndefined()
    expect((await ui.find({ key: `row:${effortKey('low')}` }))?.text).toContain('low')
    expect(world.runs).toEqual(['/model haiku'])

    await ui.unmount()
  })

  test('a command that fails says why, and the pane keeps the value it had', async ($, on) => {
    const world = host(on, ['effort'], 'model')
    await $.session.start(SESSION)

    const ui = await $.ui.mount(MOUNT)
    await ui.press({ key: modelKey('sonnet') })
    await world.clock.settle()
    await ui.redraw(PANE)

    // A hook that throws is skipped, so the run fails for want of anything
    // beneath: the toast carries that reason, whatever it says.
    expect(world.toasts).toHaveLength(1)
    expect(world.toasts[0]?.startsWith(`${EN.failed} `)).toBe(true)
    expect(world.runs).toEqual([])
    expect((await ui.find({ key: `row:${modelKey('opus')}` }))?.text).toMatch(/^●/)

    await ui.unmount()
  })

  test('fast mode has a button only where the session has /fast', async ($, on) => {
    const world = host(on, ['effort', 'fast'])
    await $.session.start(SESSION)

    const ui = await $.ui.mount(MOUNT)
    // Its own frame, under Ultracode, itself under the effort, and above the presets.
    const text = (await ui.find({}))?.text ?? ''

    expect(text.indexOf(EN.ultracode)).toBeGreaterThan(text.indexOf(EN.efforts))
    expect(text.indexOf(EN.fast)).toBeGreaterThan(text.indexOf(EN.ultracode))
    expect(text.indexOf(EN.fast)).toBeLessThan(text.indexOf(EN.presets))

    await ui.press({ key: FAST_KEY })
    await world.clock.settle()

    expect(world.runs).toEqual(['/fast'])

    await ui.unmount()
  })

  test('the ultracode button turns it on, then off, through /effort', async ($, on) => {
    const world = host(on, ['effort'])
    await $.session.start(SESSION)

    const ui = await $.ui.mount(MOUNT)
    expect((await ui.find({ key: 'head:ultracode' }))?.text).toContain(EN.ultracodeOff)

    await ui.press({ key: ULTRACODE_KEY })
    await world.clock.settle()
    expect((await ui.find({ key: 'head:ultracode' }))?.text).toContain(EN.ultracodeOn)

    await ui.press({ key: ULTRACODE_KEY })
    await world.clock.settle()

    expect(world.runs).toEqual(['/effort ultracode', '/effort ultracode off'])

    await ui.unmount()
  })

  test('/dash ultracode and /dash ultracode off run /effort', async ($, on) => {
    const world = host(on, ['effort'])
    await $.session.start(SESSION)
    const run = async (args: string) => (await $.command.run({ command: 'dash', args, ...RUN })).text

    expect(await run('ultracode')).toBe(`${EN.ultracodeSet} ${EN.ultracodeOn}`)
    await world.clock.settle()
    expect(await run('ultracode off')).toBe(`${EN.ultracodeSet} ${EN.ultracodeOff}`)
    await world.clock.settle()

    expect(world.runs).toEqual(['/effort ultracode', '/effort ultracode off'])
  })

  test('without /effort, there is no ultracode button', async ($, on) => {
    host(on, [])
    await $.session.start(SESSION)

    const ui = await $.ui.mount(MOUNT)

    expect(await ui.find({ key: ULTRACODE_KEY })).toBeUndefined()

    await ui.unmount()
  })

  test('an agent cap set by /dash set goes into each workflow script', async ($, on) => {
    const world = host(on)
    const scripts: string[] = []
    on('tool.call', { tool: 'Workflow' }, ($, e) => {
      scripts.push(String((e as unknown as Record<string, unknown>)['script']))

      return { result: '' } as never
    })
    await $.session.start(SESSION)
    const script = "export const meta = { name: 'w', description: 'd' }\nreturn await agent('go')"
    const call = () => $.tool.call({ tool: 'Workflow', script } as never)

    await call()

    await $.command.run({ command: 'dash', args: 'set maxAgents 3', ...RUN })
    await world.clock.settle()
    await call()

    expect(world.store.get('settings')).toEqual(expect.objectContaining({ maxAgents: '3' }))
    expect(scripts[0]).toBe(script)
    expect(scripts[1]).toContain('++started > 3')
  })

  test('under a cap, a script on disk is read and capped, and one run by name is refused', async ($, on) => {
    const world = host(on)
    const calls: Record<string, unknown>[] = []
    on('tool.call', { tool: 'Workflow' }, ($, e) => {
      calls.push({ ...(e as unknown as Record<string, unknown>) })

      return { result: '' } as never
    })
    on('fs.read', () => ({ value: "export const meta = { name: 'w', description: 'd' }\nreturn 1" }) as never)
    await $.session.start(SESSION)
    await $.command.run({ command: 'dash', args: 'set maxAgents 2', ...RUN })
    await world.clock.settle()

    await $.tool.call({ tool: 'Workflow', scriptPath: '/w.js' } as never)
    const named = await $.tool.call({ tool: 'Workflow', name: 'saved' } as never)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.['scriptPath']).toBeUndefined()
    expect(String(calls[0]?.['script'])).toContain('++started > 2')
    expect((named as { deny?: string }).deny).toBe(EN.capNamed('2'))
  })

  test('the drop-down switches to a model the rows do not hold', async ($, on) => {
    const world = host(on)
    await $.session.start(SESSION)

    const ui = await $.ui.mount(MOUNT)
    await ui.press({ key: MORE_MODELS_KEY })
    await ui.redraw(PANE)
    await ui.press({ key: menuOptionKey(MORE_MODELS_KEY, 'claude-opus-4-8') })
    await world.clock.settle()

    expect(world.runs).toEqual(['/model claude-opus-4-8'])

    await ui.unmount()
  })

  test('on the desktop, the drop-down is the surface Select and the rows still switch', async ($, on) => {
    const world = host(on)
    await $.session.start({ ...SESSION, surface: 'desktop' })

    const ui = await $.ui.mount({ ...MOUNT, surface: 'desktop' })

    expect((await ui.find({ key: `row:${modelKey('opus')}` }))?.text).toMatch(/^●.*Opus 5\.5/)
    await ui.select({ key: MORE_MODELS_KEY, value: 'claude-opus-4-8' })
    await ui.press({ key: effortKey('max') })
    await world.clock.settle()

    expect(world.runs).toEqual(['/model claude-opus-4-8', '/effort max'])

    await ui.unmount()
  })

  test('without /fast, there is no fast mode button', async ($, on) => {
    host(on)
    await $.session.start(SESSION)

    const ui = await $.ui.mount(MOUNT)

    expect(await ui.find({ key: FAST_KEY })).toBeUndefined()

    await ui.unmount()
  })

  test('a clicked effort is marked as asked until a main request carries it', async ($, on) => {
    host(on)
    answers(on)
    await $.session.start(SESSION)

    const ui = await $.ui.mount(MOUNT)
    await ui.press({ key: effortKey('max') })
    await ui.redraw(PANE)

    // A found element's text joins its children without the gaps between them.
    expect((await ui.find({ key: 'head:effort' }))?.text).toContain(`max(${EN.asked})`)

    await step($, 'xhigh')
    await ui.redraw(PANE)

    const head = (await ui.find({ key: 'head:effort' }))?.text

    expect(head).toContain('xhigh')
    expect(head).not.toContain(EN.asked)

    await ui.unmount()
  })

  test('the toast counts the tokens a switch forfeits, and the pane no longer says it', async ($, on) => {
    const world = host(on)
    answers(on, {
      model: 'claude-opus-5-5',
      input_tokens: 2000,
      output_tokens: 1000,
      cache_read_input_tokens: 80_000,
      cache_creation_input_tokens: 1000,
    })
    await $.session.start(SESSION)

    const ui = await $.ui.mount(MOUNT)

    await step($)
    await ui.redraw(PANE)
    expect((await ui.find({}))?.text).not.toContain('Warm cache')
    expect((await ui.find({}))?.text).not.toContain(EN.costMethod)

    await ui.press({ key: modelKey('sonnet') })
    await world.clock.settle()
    expect(world.toasts).toEqual(['⇄ Model Opus → Sonnet · 84 k tokens to cache again'])

    await ui.unmount()
  })

  test('/dash set lists the settings, changes one at once, and keeps it in the store', async ($, on) => {
    const world = host(on)
    await $.session.start(SESSION)

    const run = async (args: string) => (await $.command.run({ command: 'dash', args, ...RUN })).text

    expect(await run('set')).toContain('language = en')
    expect(await run('set colour red')).toContain(EN.settingUnknown)
    expect(await run('set language xx')).toContain(EN.settingBadLanguage)

    expect(await run('set presets fast=haiku, set=opus')).toContain('set=opus')
    expect(world.store.get('settings')).toEqual(expect.objectContaining({ presets: 'fast=haiku, set=opus' }))

    expect(await run('fast')).toBe('Preset asked: fast')
    await world.clock.settle()
    expect(world.runs).toEqual(['/model haiku'])

    expect(await run('set language fr')).toContain('Réglage enregistré : language')
    expect(await run('turbo')).toContain('Ni un modèle')

    await run('set language')
    expect(await run('turbo')).toContain('Neither a model')
  })

  test('settings kept from an earlier session are in force from the start', async ($, on) => {
    const world = host(on)
    world.store.set('settings', { language: 'de', presets: 'tief=opus/max' })
    await $.session.start(SESSION)

    expect((await $.command.run({ command: 'dash', args: 'tief', ...RUN })).text).toBe('Vorgabe angefordert: tief')
  })

  test('without /effort, the level is held and written on each main request', async ($, on) => {
    const world = host(on, [])
    let sent: unknown
    on('turn.step', async function* ($, e) {
      sent = e.effort

      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
    })
    await $.session.start(SESSION)

    await $.command.run({ command: 'dash', args: 'xhigh', ...RUN })
    await world.clock.settle()
    await step($)

    expect(world.runs).toEqual([])
    expect(sent).toBe('xhigh')
  })

  test('a held level (no /effort) gives way to the engine when the person changes it', async ($, on) => {
    const world = host(on, [])
    let sent: unknown
    on('turn.step', async function* ($, e) {
      sent = e.effort

      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null } as never
    })
    await $.session.start(SESSION)

    await step($, 'high')
    await $.command.run({ command: 'dash', args: 'max', ...RUN })
    await world.clock.settle()

    await step($, 'high')
    expect(world.runs).toEqual([])
    expect(sent).toBe('max')

    // The engine now sends low under the same model: the person ran /effort low.
    await step($, 'low')
    expect(sent).toBe('low')

    await step($, 'low')
    expect(sent).toBe('low')
  })

  test('a closed section opens on a click and frames global and project apart, three each until expanded', async ($, on) => {
    host(on)
    const agents = [
      ...['a1', 'a2', 'a3', 'a4', 'a5'].map(agentType => ({ agentType, source: 'userSettings', tokens: 10 })),
      { agentType: 'reviewer', source: 'projectSettings', tokens: 10 },
      { agentType: 'scanner:triager', source: 'plugin', tokens: 10 },
    ]
    on('session.usage', () => ({ value: { context: { breakdown: { agents } } } as never }))
    await $.session.start(SESSION)

    const ui = await $.ui.mount(MOUNT)

    expect(await ui.find({ key: sectionKey('agents') })).toBeDefined()
    expect(await ui.find({ key: entryKey('agents', 'a1') })).toBeUndefined()

    await ui.press({ key: sectionKey('agents') })
    await ui.redraw(PANE)

    expect(await ui.find({ key: entryKey('agents', 'a3') })).toBeDefined()
    expect(await ui.find({ key: entryKey('agents', 'a4') })).toBeUndefined()
    expect(await ui.find({ key: entryKey('agents', 'reviewer') })).toBeDefined()
    expect(await ui.find({ key: entryKey('agents', 'scanner:triager') })).toBeUndefined()
    expect(await ui.find({ key: frameToggleKey('agents', 'project') })).toBeUndefined()

    await ui.press({ key: frameToggleKey('agents', 'user') })
    await ui.redraw(PANE)

    expect(await ui.find({ key: entryKey('agents', 'a5') })).toBeDefined()

    await ui.press({ key: frameToggleKey('agents', 'user') })
    await ui.redraw(PANE)

    expect(await ui.find({ key: entryKey('agents', 'a5') })).toBeUndefined()

    await ui.unmount()
  })

  test('the commands and skills come from the global and the project folders', async ($, on) => {
    host(on)
    // The engine hands the hooks absolute paths, in the platform's spelling:
    // the folders are matched by how their path ends.
    const tree: [string, { name: string; kind: 'file' | 'dir' }[]][] = [
      ['home/.claude/commands', [{ name: 'deploy.md', kind: 'file' }, { name: 'git', kind: 'dir' }, { name: 'notes.txt', kind: 'file' }]],
      ['home/.claude/commands/git', [{ name: 'commit.md', kind: 'file' }]],
      ['dash/.claude/commands', [{ name: 'check.md', kind: 'file' }]],
      ['dash/.claude/skills', [{ name: 'release', kind: 'dir' }, { name: 'empty', kind: 'dir' }]],
    ]
    const slashed = (path: string) => path.replace(/\\/g, '/')
    on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home' : undefined }) as never)
    on('fs.list', ($, e) => {
      const entries = tree.find(([end]) => slashed(e.path).endsWith(end))?.[1] ?? []

      return { value: entries.map(one => ({ ...one, size: 0, mtimeMs: 0, isLink: false })) } as never
    })
    on('fs.exists', ($, e) => ({ value: slashed(e.path).endsWith('.claude/skills/release/SKILL.md') }) as never)
    await $.session.start(SESSION)

    const ui = await $.ui.mount(MOUNT)

    await ui.press({ key: sectionKey('commands') })
    await ui.press({ key: sectionKey('skills') })
    await ui.redraw(PANE)

    expect((await ui.find({ key: entryKey('commands', 'deploy') }))?.text).toContain('/deploy')
    expect(await ui.find({ key: entryKey('commands', 'git:commit') })).toBeDefined()
    expect(await ui.find({ key: entryKey('commands', 'check') })).toBeDefined()
    expect(await ui.find({ key: entryKey('skills', 'release') })).toBeDefined()
    expect(await ui.find({ key: entryKey('skills', 'empty') })).toBeUndefined()

    await ui.unmount()
  })

  test('the Session frame renames the session, the Settings section changes a /config row', async ($, on) => {
    const world = host(on)
    const sets: unknown[] = []
    on('command.run', { command: 'rename' }, ($, e) => {
      world.runs.push(`/rename ${e.args}`)

      return { text: '' }
    })
    on('config.list', () => ({
      value: [
        { key: 'verbose', label: 'Verbose output', kind: 'boolean', value: false, provider: { kind: 'core' }, isLocked: false },
        { key: 'theme', label: 'Theme', kind: 'choice', value: 'dark', options: ['dark', 'light'], provider: { kind: 'core' }, isLocked: true },
      ] as never,
    }))
    on('config.set', ($, e) => {
      sets.push({ key: e.key, value: e.value })

      return { value: e.value } as never
    })
    await $.session.start(SESSION)

    const ui = await $.ui.mount(MOUNT)
    await ui.press({ key: CONFIG_KEY })
    await ui.redraw(PANE)

    await ui.input({ key: RENAME_KEY, text: '  refonte du panneau ' })
    await ui.press({ key: configKey('verbose') })
    await world.clock.settle()

    expect(world.runs).toEqual(['/rename refonte du panneau'])
    await ui.redraw(PANE)
    expect(await ui.find({ key: RENAME_KEY })).toBeUndefined()
    expect((await ui.find({ key: 'row:session:name' }))?.text).toContain('refonte du panneau')
    expect(sets).toEqual([{ key: 'verbose', value: true }])
    expect((await ui.find({ key: `row:${configKey('theme')}` }))?.text).toContain('🔒')

    await ui.unmount()
  })

  test('/compact runs only once confirmed, with the instructions typed, and a cancel drops it', async ($, on) => {
    const world = host(on)
    on('command.run', { command: 'compact' }, ($, e) => {
      world.runs.push(`/compact ${e.args}`.trimEnd())

      return { text: '' }
    })
    await $.session.start(SESSION)

    const ui = await $.ui.mount(MOUNT)
    await ui.press({ key: COMPACT_KEY })
    await ui.redraw(PANE)
    expect(world.runs).toEqual([])

    await ui.press({ key: COMPACT_CANCEL_KEY })
    await ui.redraw(PANE)
    expect(await ui.find({ key: COMPACT_CONFIRM_KEY })).toBeUndefined()
    expect(world.runs).toEqual([])

    await ui.press({ key: COMPACT_KEY })
    await ui.redraw(PANE)
    await ui.press({ key: COMPACT_CONFIRM_KEY })
    await world.clock.settle()
    await ui.redraw(PANE)

    expect(world.runs).toEqual(['/compact'])
    expect((await ui.find({ key: COMPACT_KEY }))?.text).toContain('⊟ compact')

    await ui.press({ key: COMPACT_KEY })
    await ui.redraw(PANE)
    await ui.input({ key: COMPACT_NOTE_KEY, text: ' garder les tests ', kind: 'change' })
    await ui.press({ key: COMPACT_CONFIRM_KEY })
    await world.clock.settle()

    await ui.redraw(PANE)
    await ui.press({ key: COMPACT_KEY })
    await ui.redraw(PANE)
    await ui.input({ key: COMPACT_NOTE_KEY, text: 'le plan seul' })
    await world.clock.settle()

    expect(world.runs).toEqual(['/compact', '/compact garder les tests', '/compact le plan seul'])

    await ui.unmount()
  })

  test('a preset composed in the pane is added, drawn, and deleted by its cross', async ($, on) => {
    const world = host(on)
    await $.session.start(SESSION)

    const ui = await $.ui.mount(MOUNT)
    await ui.press({ key: NEW_PRESET_KEY })
    await ui.redraw(PANE)
    await ui.input({ key: PRESET_NAME_KEY, text: 'review', kind: 'change' })
    await ui.press({ key: PRESET_MODEL_KEY })
    await ui.redraw(PANE)
    await ui.press({ key: menuOptionKey(PRESET_MODEL_KEY, 'sonnet') })
    await ui.redraw(PANE)
    await ui.press({ key: PRESET_EFFORT_KEY })
    await ui.redraw(PANE)
    await ui.press({ key: menuOptionKey(PRESET_EFFORT_KEY, 'high') })
    await ui.press({ key: PRESET_ADD_KEY })
    await world.clock.settle()
    await ui.redraw(PANE)

    expect((world.store.get('settings') as { presets: string }).presets).toMatch(/, review=sonnet\/high$/)
    expect(await ui.find({ key: presetKey('review') })).toBeDefined()
    expect(await ui.find({ key: presetDeleteKey('deep') })).toBeUndefined()

    await ui.press({ key: presetDeleteKey('review') })
    await world.clock.settle()
    await ui.redraw(PANE)

    expect((world.store.get('settings') as { presets: string }).presets).not.toContain('review')
    expect(await ui.find({ key: presetKey('review') })).toBeUndefined()

    await ui.unmount()
  })

  test('the Session frame colors each gauge by its share used, quotas included', async ($, on) => {
    host(on)
    on('session.usage', () => ({
      value: {
        startedAt: 0,
        context: { percent: 30, window: 200_000 },
        rateLimits: [
          { kind: 'five_hour', percentUsed: 60, resetsAt: '2026-10-07T14:00:00Z' },
          { kind: 'seven_day', percentUsed: 95 },
        ],
        cost: { usd: 1.5 },
      } as never,
    }))
    await $.session.start(SESSION)

    const ui = await $.ui.mount(MOUNT)
    // The color of a row's filled cells, the row found by its label.
    const fillOf = async (label: RegExp): Promise<unknown> => {
      const row = await ui.find({ type: 'Text', text: label })
      const cells = row?.children.find(child => typeof child === 'object' && child !== null && /▰/.test(JSON.stringify(child)))

      return (cells as { props?: { color?: unknown } } | undefined)?.props?.color
    }
    const [green, yellow, , red] = USAGE_COLORS.map(step => step.color)

    expect(await fillOf(/^Ctx:/)).toBe(green)
    expect(await fillOf(/^5 h:/)).toBe(yellow)
    expect(await fillOf(/^Week:/)).toBe(red)

    await ui.unmount()
  })

  test('compact mode folds each list onto its current row, or its first, and is kept with the settings', async ($, on) => {
    const world = host(on)
    await $.session.start(SESSION)

    const ui = await $.ui.mount(MOUNT)
    await ui.press({ key: COMPACT_MODE_KEY })
    await world.clock.settle()
    await ui.redraw(PANE)

    // Opus at high: those rows alone; no preset matches it, so the first.
    expect((await ui.find({ key: `row:${modelKey('opus')}` }))?.text).toMatch(/^●/)
    expect(await ui.find({ key: `row:${modelKey('sonnet')}` })).toBeUndefined()
    expect((await ui.find({ key: `row:${effortKey('high')}` }))?.text).toMatch(/^●/)
    expect(await ui.find({ key: `row:${effortKey('low')}` })).toBeUndefined()
    expect((await ui.find({ key: `row:${presetKey('deep')}` }))?.text).toMatch(/^○/)
    expect(await ui.find({ key: `row:${presetKey('daily')}` })).toBeUndefined()
    expect(await ui.find({ key: MORE_MODELS_KEY })).toBeUndefined()
    expect(world.store.get('settings')).toEqual(expect.objectContaining({ compact: 'on' }))

    await ui.press({ key: COMPACT_MODE_KEY })
    await world.clock.settle()
    await ui.redraw(PANE)
    expect(await ui.find({ key: `row:${modelKey('sonnet')}` })).toBeDefined()

    await ui.unmount()
  })

  test("a frame's ↧ puts its values in the band above the prompt, whose /compact asks first", async ($, on) => {
    const world = host(on)
    on('session.usage', () => ({
      value: {
        startedAt: 0,
        context: { percent: 30, window: 200_000 },
        rateLimits: [{ kind: 'five_hour', percentUsed: 60 }],
        cost: { usd: 1.5 },
      } as never,
    }))
    on('command.run', { command: 'compact' }, ($, e) => {
      world.runs.push(`/compact ${e.args}`.trimEnd())

      return { text: '' }
    })
    // The engine's own band: nothing.
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', props: {}, children: [] }) as never)
    await $.session.start(SESSION)

    // Nothing put there yet: the band is left to the engine.
    const band = await $.ui.mount(BAND_MOUNT)
    expect(await band.find({ type: 'Text', text: /^◆/ })).toBeUndefined()

    const ui = await $.ui.mount(MOUNT)
    await ui.press({ key: bandKey('model') })
    await world.clock.settle()
    await ui.press({ key: bandKey('session') })
    await world.clock.settle()
    await band.redraw(BAND)

    expect(await band.find({ type: 'Text', text: /^◆ Opus 5\.5/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: /^⚡/ })).toBeUndefined()
    expect(await band.find({ type: 'Text', text: /^5 h:/ })).toBeDefined()
    expect(await band.find({ type: 'Text', text: '$1.50' })).toBeDefined()
    expect(world.store.get('settings')).toEqual(expect.objectContaining({ band: 'model,session' }))
    expect(world.toasts.at(-1)).toBe(`${EN.session} ${EN.bandPut}`)

    // A stray click summarizes nothing: the band asks first.
    await band.press({ key: BAND_COMPACT_KEY })
    await band.redraw(BAND)
    expect(world.runs).not.toContain('/compact')
    await band.press({ key: BAND_COMPACT_CONFIRM_KEY })
    await world.clock.settle()
    expect(world.runs).toContain('/compact')

    await ui.redraw(PANE)
    await ui.press({ key: bandKey('model') })
    await world.clock.settle()
    await band.redraw(BAND)
    expect(await band.find({ type: 'Text', text: /^◆/ })).toBeUndefined()

    await band.unmount()
    await ui.unmount()
  })
})

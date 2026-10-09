/**
 * What the pane offers: the models a click switches to, the effort levels,
 * the presets that set both, and how a model id the engine reports maps
 * back to one of them. Pure, so the tests reach it without an engine.
 */

import { say } from '../say'

/**
 * One model the pane offers.
 */
export type ModelChoice = {
  /** The pane's key for it: a family for the built-in ones, the id otherwise. */
  key: string
  /** The name the button shows. */
  label: string
  /** What `/model` is run with: an alias, or a full id where none exists. */
  arg: string
  /** False for a model that takes no effort setting. */
  hasEffort: boolean
  /** The color its row, its dot and its frame are drawn in. */
  color: string
}

/**
 * The built-in models, strongest first. An alias follows the latest of its
 * family; Fable has none, so it is named by its id, which the `models` and
 * `hideModels` options replace when it moves on.
 */
export const MODELS: readonly ModelChoice[] = [
  { key: 'fable', label: 'Fable', arg: 'claude-fable-5-1', hasEffort: true, color: '#c084fc' },
  { key: 'opus', label: 'Opus', arg: 'opus', hasEffort: true, color: '#d97757' },
  { key: 'sonnet', label: 'Sonnet', arg: 'sonnet', hasEffort: true, color: '#60a5fa' },
  { key: 'haiku', label: 'Haiku', arg: 'haiku', hasEffort: false, color: '#34d399' },
]

/**
 * The models the pane's drop-down offers besides its rows: every versioned
 * id still served. No hook lists what `/model` offers, so the list is kept
 * here (Mythos left out: Project Glasswing only).
 */
export const MORE_MODELS: readonly { id: string; label: string }[] = [
  { id: 'claude-fable-5', label: 'Fable 5' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-opus-5', label: 'Opus 5' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8' },
  { id: 'claude-opus-4-7', label: 'Opus 4.7' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
]

/**
 * The agent caps the Ultracode frame offers; the empty one sets none.
 */
export const AGENT_CAPS = ['', '1', '2', '3', '4', '5', '8', '16'] as const

/**
 * The effort levels, lowest first, as `/effort` and `turn.step` spell them.
 */
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

/**
 * One effort level.
 */
export type Effort = (typeof EFFORTS)[number]

/**
 * The color of each effort level, cool to hot.
 */
export const EFFORT_COLORS: Record<Effort, string> = {
  low: '#6ee7b7',
  medium: '#a3e635',
  high: '#facc15',
  xhigh: '#fb923c',
  max: '#f87171',
}

/**
 * A model and, where it takes one, an effort level, set together.
 */
export type Preset = {
  /** Its name, as `/dash <name>` and its button spell it. */
  key: string
  /** The model it switches to. */
  model: ModelChoice
  /** The level it sets, or undefined to leave the effort alone. */
  effort?: Effort
}

/**
 * One thing a click or `/dash <args>` asks for.
 */
export type Pick = { model: ModelChoice } | { effort: Effort } | { preset: Preset }

/**
 * What a pick would change: the model to switch to, the level to set,
 * either absent when it is already the current one.
 */
export type Plan = { model?: ModelChoice; effort?: Effort }

/**
 * A level drawn as a gauge of five cells, as many filled as its rank.
 *
 * @param level the effort level
 * @returns the filled part and the empty part, drawn in two colors
 */
export function gaugeOf(level: Effort): { filled: string; empty: string } {
  const rank = EFFORTS.indexOf(level) + 1

  return { filled: '▰'.repeat(rank), empty: '▱'.repeat(EFFORTS.length - rank) }
}

/**
 * How full the context window is, to the hundredth: the tokens over the
 * window where both are known (the engine's own percent is whole), with a
 * decimal comma (`33,26`).
 *
 * @param context the live window: its whole percent, its tokens, its size
 * @returns the percent as a number and as text
 */
export function contextPercentOf(context: { percent: number; tokens?: number; window: number }): {
  value: number
  text: string
} {
  const value = context.tokens !== undefined && context.window > 0 ? (context.tokens / context.window) * 100 : context.percent

  return { value, text: value.toFixed(2).replace('.', ',') }
}

/** How many cells the context gauge has. */
export const CONTEXT_CELLS = 13

/**
 * The context window's fill drawn as a gauge of the effort's cells.
 *
 * @param percent how full the window is, 0 to 100 and past it
 * @param total how many cells the gauge has
 * @returns the filled part and the empty part
 */
export function contextGaugeOf(percent: number, total = CONTEXT_CELLS): { filled: string; empty: string } {
  const cells = Math.min(total, Math.max(0, Math.round((percent / 100) * total)))

  return { filled: '▰'.repeat(cells), empty: '▱'.repeat(total - cells) }
}

/**
 * The notification a switch shows: what it was, what it is now.
 *
 * @param kind which setting switched
 * @param before the value before, as the pane names it, or undefined
 * @param after the value now
 * @returns the line of the toast
 */
export function switchedText(kind: 'model' | 'effort', before: string | undefined, after: string): string {
  const icon = kind === 'model' ? '⇄' : '⚡'
  const name = kind === 'model' ? say().models : say().efforts

  if (before === after) {
    return `${icon} ${name} ${say().already} ${after}`
  }

  return before === undefined ? `${icon} ${name} → ${after}` : `${icon} ${name} ${before} → ${after}`
}

/**
 * The notification a preset shows: its name, then each value it moved.
 *
 * @param preset the preset
 * @param moves each value it moved, before and after, as the pane names them
 * @returns the line of the toast
 */
export function presetText(preset: Preset, moves: readonly [string | undefined, string][]): string {
  const head = `◇ ${say().preset} ${preset.key}:`

  if (moves.length === 0) {
    return `${head} ${say().already} ${presetLabelOf(preset)}`
  }

  return `${head} ${moves.map(([before, after]) => (before === undefined ? `→ ${after}` : `${before} → ${after}`)).join(', ')}`
}

/**
 * What a preset sets, as its row reads: `Opus · xhigh`, `Haiku`.
 *
 * @param preset the preset
 * @returns the label
 */
export function presetLabelOf(preset: Preset): string {
  return preset.effort === undefined || !preset.model.hasEffort
    ? preset.model.label
    : `${preset.model.label} · ${preset.effort}`
}

/**
 * The offered model a model id belongs to: one whose own id it is first,
 * then the family its id names.
 *
 * @param model an id or alias as the engine reports it (`claude-opus-5-5`)
 * @param models the models the pane offers
 * @returns the choice, or undefined for a model the pane does not offer
 */
export function choiceOf(model: string | undefined, models: readonly ModelChoice[] = MODELS): ModelChoice | undefined {
  const id = (model ?? '').toLowerCase()

  if (id === '') {
    return undefined
  }

  return (
    models.find(one => id === one.arg.toLowerCase() || id.startsWith(`${one.arg.toLowerCase()}-`)) ??
    models.find(one => id.includes(one.key.toLowerCase()))
  )
}

/**
 * The version a model id carries: `5.5` of `claude-opus-5-5`, `4.5` of
 * `claude-haiku-4-5-20251001`.
 *
 * @param model the id
 * @returns the version, or undefined for an alias or an id without one
 */
export function versionOf(model: string | undefined): string | undefined {
  const found = /^claude-[a-z]+-(\d+)-(\d{1,2})(?:-\d{8})?(?:\[.*\])?$/.exec((model ?? '').toLowerCase())

  return found === null ? undefined : `${found[1]}.${found[2]}`
}

/**
 * The name a model's row shows: with the version of the current id when
 * its label names none.
 *
 * @param choice the model
 * @param model the session's model id, or undefined
 * @param isCurrent whether the row is the current model's
 * @returns the label
 */
export function labelOf(choice: ModelChoice, model: string | undefined, isCurrent: boolean): string {
  const version = isCurrent ? versionOf(model) : undefined

  return version === undefined || /\d/.test(choice.label) ? choice.label : `${choice.label} ${version}`
}

/**
 * A value read as an effort level.
 *
 * @param value what a step or a setting carries (a level, a number, nothing)
 * @returns the level, or undefined for a number or anything else
 */
export function effortOf(value: unknown): Effort | undefined {
  return EFFORTS.find(level => level === value)
}

/**
 * The level saved as the default: the model's own
 * (`modelSettings[<id>].effortLevel`), else the top-level `effortLevel`.
 *
 * The session may name its model by an alias (`opus`) or with a suffix
 * (`claude-opus-5-5[1m]`): the exact id is tried first, then any key of the
 * same offered model.
 *
 * @param settings the settings, merged
 * @param model the session's model, as it reports it
 * @param models the models the pane offers
 * @returns that level, or nothing where none is saved
 */
export function savedEffortOf(
  settings: Record<string, unknown>,
  model: string | undefined,
  models: readonly ModelChoice[] = MODELS,
): Effort | undefined {
  const all = (settings['modelSettings'] as Record<string, { effortLevel?: unknown }> | undefined) ?? {}
  const bare = (model ?? '').replace(/\[.*\]$/, '')
  const family = choiceOf(bare, models)
  const key = bare in all ? bare : Object.keys(all).find(one => family !== undefined && choiceOf(one, models) === family)

  return effortOf(key === undefined ? undefined : all[key]?.effortLevel) ?? effortOf(settings['effortLevel'])
}

/**
 * What a pick would change from the current values. A level is left out
 * where the model it would apply to takes no effort.
 *
 * @param pick what is asked for
 * @param model the session's model id
 * @param effort the current level
 * @param models the models the pane offers
 * @returns the plan, empty when it would change nothing
 */
export function planOf(
  pick: Pick,
  model: string | undefined,
  effort: Effort | undefined,
  models: readonly ModelChoice[] = MODELS,
): Plan {
  const current = choiceOf(model, models)

  if ('model' in pick) {
    return pick.model.key === current?.key ? {} : { model: pick.model }
  }

  if ('effort' in pick) {
    return current?.hasEffort === false || pick.effort === effort ? {} : { effort: pick.effort }
  }

  const { preset } = pick
  const plan: Plan = preset.model.key === current?.key ? {} : { model: preset.model }

  if (preset.effort !== undefined && preset.model.hasEffort && preset.effort !== effort) {
    plan.effort = preset.effort
  }

  return plan
}

/**
 * Why a pick would change nothing, so no command need run for it.
 *
 * @param pick what is asked for
 * @param model the session's model id, as last reported
 * @param effort the current effort level
 * @param models the models the pane offers
 * @returns the line to show instead of switching, or undefined to switch
 */
export function idleReasonOf(
  pick: Pick,
  model: string | undefined,
  effort: Effort | undefined,
  models: readonly ModelChoice[] = MODELS,
): string | undefined {
  const plan = planOf(pick, model, effort, models)

  if (plan.model !== undefined || plan.effort !== undefined) {
    return undefined
  }

  if ('model' in pick) {
    return switchedText('model', pick.model.label, pick.model.label)
  }

  if ('preset' in pick) {
    return presetText(pick.preset, [])
  }

  return choiceOf(model, models)?.hasEffort === false ? say().noEffort : switchedText('effort', effort, pick.effort)
}

/**
 * What `/dash <args>` names: a model, an effort level, a preset, or
 * none of them. Models win a name they share with a preset.
 *
 * @param args the command's argument, case and spaces ignored
 * @param models the models the pane offers
 * @param presets the presets the pane offers
 * @returns the pick, or undefined
 */
export function pickOf(
  args: string,
  models: readonly ModelChoice[] = MODELS,
  presets: readonly Preset[] = [],
): Pick | undefined {
  const word = args.trim().toLowerCase()

  if (word === '') {
    return undefined
  }

  const model = modelNamed(word, models)

  if (model !== undefined) {
    return { model }
  }

  const effort = effortOf(word)

  if (effort !== undefined) {
    return { effort }
  }

  const preset = presets.find(one => one.key === word)

  return preset === undefined ? undefined : { preset }
}

/**
 * The model a word names, by its key or by what `/model` takes.
 *
 * @param word the name, lower case
 * @param models the models the pane offers
 * @returns the model, or undefined
 */
export function modelNamed(word: string, models: readonly ModelChoice[]): ModelChoice | undefined {
  return models.find(one => one.key.toLowerCase() === word || one.arg.toLowerCase() === word)
}

/** The keys a hotkey may be, in the order they are handed out. */
// The letters of the library sections (`LIBRARY_HOTKEYS`) are left out.
const HOTKEYS = '123456789bdefijquwz'

/**
 * The hotkeys of the buttons that are always there, one letter each, left
 * out of the run above as the library's a, c, s, p, m, h are.
 */
export const FIXED_HOTKEYS = {
  /** Opens the other models' drop-down. */
  moreModels: 'o',
  /** Opens the new preset's form. */
  newPreset: 'n',
  /** Adds the preset composed. */
  addPreset: 'v',
  /** Asks for /compact, or drops the question. */
  compact: 'x',
  /** Confirms /compact. */
  compactYes: 'y',
  /** Brings the rename field back. */
  rename: 'r',
  /** Opens the Settings section. */
  config: 'g',
  /** Runs /reload-plugins. */
  reload: 'l',
  /** Hides the hotkeys. */
  keyboard: 'k',
} as const

/**
 * The hotkeys of every button, handed out in one run: the models take the
 * first digits, the levels the next, the presets, the fast mode and
 * ultracode the letters after. A button past the 19th has none.
 *
 * @param counts how many models, levels and presets, and whether fast mode and ultracode have a button
 * @returns each group's hotkeys, in order
 */
export function hotkeysOf(counts: {
  models: number
  efforts: number
  presets: number
  fast: boolean
  ultracode?: boolean
}): {
  models: (string | undefined)[]
  efforts: (string | undefined)[]
  presets: (string | undefined)[]
  fast: string | undefined
  ultracode: string | undefined
} {
  let next = 0
  const take = (n: number): (string | undefined)[] => Array.from({ length: n }, () => HOTKEYS[next++])

  const models = take(counts.models)
  const efforts = take(counts.efforts)
  const presets = take(counts.presets)
  const fast = counts.fast ? take(1)[0] : undefined
  const ultracode = counts.ultracode === true ? take(1)[0] : undefined

  return { models, efforts, presets, fast, ultracode }
}

/**
 * A workflow script whose `agent()` refuses every call past the cap: a
 * counter goes right after the `meta` literal the script must open with. A
 * refused call rejects, which `parallel()` and `pipeline()` turn into `null`.
 * A nested `workflow()` would start agents the counter never sees: it is
 * refused outright.
 *
 * The literal is found by a scan that skips strings and comments, so a
 * `meta` named in a comment, or a brace or quote inside one, misleads it not.
 *
 * @param script the script, `export const meta = {...}` first
 * @param cap how many agents it may start, a whole number from 1
 * @returns the capped script, or nothing where no `meta` literal is found
 */
export function cappedScriptOf(script: string, cap: number): string | undefined {
  if (!Number.isInteger(cap) || cap < 1) {
    return undefined
  }

  const meta = /export\s+const\s+meta\s*=\s*\{/y
  let depth = 0
  let end = -1

  for (let i = 0; i < script.length && end === -1; i++) {
    const char = script[i]
    const pair = script.slice(i, i + 2)

    if (char === '"' || char === "'" || char === '`') {
      // To the closing quote, escapes skipped.
      for (i++; i < script.length && script[i] !== char; i++) {
        i += script[i] === '\\' ? 1 : 0
      }
    } else if (pair === '//') {
      i = script.indexOf('\n', i)
      i = i === -1 ? script.length : i
    } else if (pair === '/*') {
      i = script.indexOf('*/', i + 2)
      i = i === -1 ? script.length : i + 1
    } else if (depth > 0 && char === '{') {
      depth++
    } else if (depth > 0 && char === '}') {
      end = --depth === 0 ? i + 1 : -1
    } else if (depth === 0) {
      meta.lastIndex = i

      if (meta.test(script)) {
        depth = 1
        i = meta.lastIndex - 1
      }
    }
  }

  if (end === -1) {
    return undefined
  }

  const guard =
    `\n;{ let started = 0; const uncapped = agent; agent = (...args) => ++started > ${cap}` +
    ` ? Promise.reject(new Error('dash: agent cap (${cap}) reached')) : uncapped(...args);` +
    ` workflow = () => Promise.reject(new Error('dash: no nested workflow under the agent cap')) }\n`

  return script.slice(0, end) + guard + script.slice(end)
}

/**
 * Fast mode's state, read from what `/fast` answered (`Fast mode ON`): the
 * engine tells a mod no other way.
 *
 * @param text the command's output
 * @returns on or off, or undefined where the text says neither
 */
export function fastStateOf(text: string | undefined): boolean | undefined {
  const word = /\b(ON|OFF)\b/.exec(text ?? '')?.[1]

  return word === undefined ? undefined : word === 'ON'
}

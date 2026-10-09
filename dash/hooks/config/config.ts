/**
 * The settings, read: which models the pane offers and which presets. Each
 * setting is one line written by hand with `/dash set`, so a part that does
 * not read is set aside and named on the pane rather than failing the module.
 * Pure, so the tests reach it without an engine.
 */

import { MODELS, effortOf, modelNamed } from '../catalog'
import type { ModelChoice, Preset } from '../catalog'
import { SET_WORD } from '../settings'

/** The colors added models take, in turn. */
const EXTRA_COLORS = ['#f472b6', '#22d3ee', '#a78bfa', '#fbbf24'] as const

/** A model id as `/model` takes it. */
const MODEL_ID = /^[a-z0-9][a-z0-9.\-]*(\[[a-z0-9]+\])?$/

/** A preset's name. */
const PRESET_NAME = /^[a-z][a-z0-9-]*$/

/**
 * What the settings make of the catalog.
 */
export type Catalog = {
  /** The models the pane offers, the built-in ones first. */
  models: ModelChoice[]
  /** The presets, in the order the option lists them. */
  presets: Preset[]
  /** The parts of the settings set aside, as they were written. */
  ignored: string[]
}

/**
 * The comma-separated parts of an option, trimmed, the empty ones dropped.
 *
 * @param value the option as `/config` holds it
 * @returns the parts
 */
export function partsOf(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map(part => part.trim())
    .filter(part => part !== '')
}

/**
 * The catalog the settings describe.
 *
 * - `models`: ids to add, each `id` or `id=Label` (`claude-opus-4-1=Opus 4.1`);
 * - `hideModels`: keys or ids of models to leave out (`fable`);
 * - `presets`: each `name=model/effort` or `name=model` (`quick=haiku`).
 *
 * @param prefs the three settings, as `/dash set` holds them
 * @returns the models, the presets, and what was set aside
 */
export function catalogOf(prefs: { models?: unknown; hideModels?: unknown; presets?: unknown }): Catalog {
  const ignored: string[] = []
  const hidden = new Set(partsOf(prefs.hideModels).map(part => part.toLowerCase()))
  const models = MODELS.filter(one => !hidden.has(one.key) && !hidden.has(one.arg))
  let added = 0

  for (const part of partsOf(prefs.models)) {
    const [rawId, ...rest] = part.split('=')
    const id = (rawId ?? '').trim().toLowerCase()
    const label = rest.join('=').trim()

    if (!MODEL_ID.test(id) || modelNamed(id, models) !== undefined || hidden.has(id)) {
      ignored.push(part)
      continue
    }

    models.push({
      key: id,
      label: label === '' ? id : label,
      arg: id,
      hasEffort: !id.includes('haiku'),
      color: EXTRA_COLORS[added++ % EXTRA_COLORS.length] ?? '#888888',
    })
  }

  const presets: Preset[] = []

  for (const part of partsOf(prefs.presets)) {
    const preset = presetOf(part, models)

    if (preset === undefined || presets.some(one => one.key === preset.key)) {
      ignored.push(part)
      continue
    }

    presets.push(preset)
  }

  return { models, presets, ignored }
}

/**
 * One preset, read from its part of the option.
 *
 * @param part `name=model/effort` or `name=model`
 * @param models the models a preset may name
 * @returns the preset, or undefined where any piece does not read
 */
export function presetOf(part: string, models: readonly ModelChoice[]): Preset | undefined {
  const [rawName, rawSetting] = part.split('=')
  const key = (rawName ?? '').trim().toLowerCase()
  const [rawModel, rawEffort] = (rawSetting ?? '').split('/')
  const model = modelNamed((rawModel ?? '').trim().toLowerCase(), models)
  const effort = rawEffort === undefined ? undefined : effortOf(rawEffort.trim().toLowerCase())

  // A preset named like a model, a level, `set` or `ultracode` could never be
  // typed: `/dash` reads the name as one of those first.
  const isShadowed =
    modelNamed(key, models) !== undefined || effortOf(key) !== undefined || key === SET_WORD || key === 'ultracode'

  if (!PRESET_NAME.test(key) || isShadowed || model === undefined || (rawEffort !== undefined && effort === undefined)) {
    return undefined
  }

  return effort === undefined ? { key, model } : { key, model, effort }
}

/** A preset the person is composing in the pane, before it is added. */
export type PresetDraft = {
  name: string
  /** A model's key, as the rows name it. */
  model: string
  /** A level, or empty for the model's own. */
  effort: string
}

/**
 * The part a draft adds to the `presets` setting, once it reads as a preset
 * no other one is named like.
 *
 * @param draft what the person composed
 * @param models the models a preset may name
 * @param presets the presets there are
 * @returns `{ part }` (`name=model/effort`), or why it is refused
 */
export function presetPartOf(
  draft: PresetDraft,
  models: readonly ModelChoice[],
  presets: readonly Preset[],
): { part: string } | { error: 'name' | 'exists' } {
  const name = draft.name.trim().toLowerCase()
  const hasEffort = models.find(one => one.key === draft.model)?.hasEffort ?? false
  const part = hasEffort && draft.effort !== '' ? `${name}=${draft.model}/${draft.effort}` : `${name}=${draft.model}`

  if (presetOf(part, models) === undefined) {
    return { error: 'name' }
  }

  return presets.some(one => one.key === name) ? { error: 'exists' } : { part }
}

/**
 * The `presets` setting without one preset: its part dropped, the others
 * kept as written.
 *
 * @param presets the setting as it stands
 * @param key the preset's name
 * @returns the setting without it
 */
export function withoutPreset(presets: string, key: string): string {
  return partsOf(presets)
    .filter(part => (part.split('=')[0] ?? '').trim().toLowerCase() !== key)
    .join(', ')
}

/**
 * Whether a preset is the person's own, not one the mod ships with.
 *
 * @param key the preset's name
 * @param defaults the shipped `presets` setting
 * @returns true for a preset the defaults do not name
 */
export function isOwnPreset(key: string, defaults: string): boolean {
  return !partsOf(defaults).some(part => (part.split('=')[0] ?? '').trim().toLowerCase() === key)
}

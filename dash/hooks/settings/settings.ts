/**
 * The mod's own settings, set with `/dash set <key> <value>` and kept in
 * its store between sessions. They live here rather than in the manifest's
 * `userConfig` so that installing the mod asks nothing: the engine's install
 * dialog lists every `userConfig` option and offers no way to leave it out.
 * Pure, so the tests reach it without an engine.
 */

import { LANGUAGES } from '../say'

/** The word that opens a settings command: `/dash set …`. */
export const SET_WORD = 'set'

/** The settings, by the key `/dash set` names them with. */
export type Prefs = {
  /** The language the pane speaks: a tag of `LANGUAGES`. */
  language: string
  /** The presets, `name=model/effort` or `name=model`, comma-separated. */
  presets: string
  /** The models to add, `id` or `id=Label`, comma-separated. */
  models: string
  /** The keys or ids of the models to leave out, comma-separated. */
  hideModels: string
  /** How many agents a workflow may start; empty for no cap. */
  maxAgents: string
  /** Whether the pane shows and binds its hotkeys: `on` or `off`. */
  keyboard: string
  /** Whether the pane folds its lists onto their current row: `on` or `off`. */
  compact: string
  /** What the band above the prompt shows, of `BAND_PARTS`, comma-separated. */
  band: string
}

/** One setting's key. */
export type PrefKey = keyof Prefs

/** The keys, in the order `/dash set` lists them. */
export const PREF_KEYS: readonly PrefKey[] = ['language', 'presets', 'models', 'hideModels', 'maxAgents', 'keyboard', 'compact', 'band']

/** What the band above the prompt can show, in its order. */
export const BAND_PARTS = ['model', 'effort', 'session'] as const

/** One of them. */
export type BandPart = (typeof BAND_PARTS)[number]

/**
 * The parts a `band` setting names, unknown words left out.
 *
 * @param band the setting
 * @returns the parts, in the band's order
 */
export function bandOf(band: string): BandPart[] {
  const words = band.split(',').map(one => one.trim().toLowerCase())

  return BAND_PARTS.filter(part => words.includes(part))
}

/** What a setting is before anyone sets it. */
export const DEFAULT_PREFS: Prefs = {
  language: 'en',
  presets: 'deep=opus/xhigh, daily=sonnet/medium, quick=haiku',
  models: '',
  hideModels: '',
  maxAgents: '',
  keyboard: 'off',
  compact: 'off',
  band: '',
}

/**
 * The settings a stored value holds, each missing or malformed one at its
 * default.
 *
 * @param stored what the store answered, or undefined
 * @returns the settings
 */
export function prefsOf(stored: unknown): Prefs {
  const prefs = { ...DEFAULT_PREFS }

  if (typeof stored !== 'object' || stored === null) {
    return prefs
  }

  for (const key of PREF_KEYS) {
    const value = (stored as Record<string, unknown>)[key]

    if (typeof value === 'string') {
      prefs[key] = value
    }
  }

  // A cap edited by hand into something else would cap nothing: none, then.
  if (!/^([1-9][0-9]*)?$/.test(prefs.maxAgents)) {
    prefs.maxAgents = ''
  }

  // Hotkeys hidden unless asked for.
  if (prefs.keyboard !== 'on') {
    prefs.keyboard = 'off'
  }

  if (prefs.compact !== 'on') {
    prefs.compact = 'off'
  }

  prefs.band = bandOf(prefs.band).join(',')

  return prefs
}

/**
 * What `/dash set …` asks: to list the settings, or to set one.
 *
 * @param args the command's argument
 * @returns `{ key, value }` (the key as typed, the value trimmed, empty to
 *   reset), `{}` to list, or undefined when the argument is no settings command
 */
export function setRequestOf(args: string): { key?: string; value?: string } | undefined {
  const trimmed = args.trim()
  const [word, key, ...rest] = trimmed.split(/\s+/)

  if (word?.toLowerCase() !== SET_WORD) {
    return undefined
  }

  return key === undefined ? {} : { key, value: rest.join(' ').trim() }
}

/**
 * The key a word names, case ignored.
 *
 * @param word the key as typed
 * @returns the key, or undefined
 */
export function prefKeyOf(word: string): PrefKey | undefined {
  return PREF_KEYS.find(key => key.toLowerCase() === word.toLowerCase())
}

/**
 * The settings once one is set: an empty value puts it back to its default.
 *
 * @param prefs the settings now
 * @param key the setting
 * @param value its new value, or empty for the default
 * @returns the new settings, or `error` naming what was refused
 */
export function withPref(
  prefs: Prefs,
  key: PrefKey,
  value: string,
): { prefs: Prefs } | { error: 'language' | 'maxAgents' | 'keyboard' | 'compact' | 'band' } {
  const next = value === '' ? DEFAULT_PREFS[key] : value

  if (key === 'language' && LANGUAGES[next.toLowerCase()] === undefined) {
    return { error: 'language' }
  }

  if (key === 'maxAgents' && next !== '' && !/^[1-9][0-9]*$/.test(next)) {
    return { error: 'maxAgents' }
  }

  if ((key === 'keyboard' || key === 'compact') && next !== 'on' && next !== 'off') {
    return { error: key }
  }

  const words = next.split(',').map(one => one.trim().toLowerCase()).filter(one => one !== '')

  if (key === 'band' && words.some(word => !(BAND_PARTS as readonly string[]).includes(word))) {
    return { error: 'band' }
  }

  return {
    prefs: { ...prefs, [key]: key === 'language' ? next.toLowerCase() : key === 'band' ? bandOf(next).join(',') : next },
  }
}

/**
 * The settings as `/dash set` lists them, one `key = value` a line.
 *
 * @param prefs the settings
 * @returns the lines
 */
export function prefsLines(prefs: Prefs): string[] {
  return PREF_KEYS.map(key => `${key} = ${prefs[key] === '' ? '—' : prefs[key]}`)
}

/**
 * Where the engine keeps its own state, `/config`'s choices among it:
 * `.claude.json` in `CLAUDE_CONFIG_DIR` where set, else in the home folder.
 *
 * @param home the home folder
 * @param configDir `CLAUDE_CONFIG_DIR`
 * @returns the file's path, or nothing where neither is known
 */
export function stateFileOf(home: string | undefined, configDir: string | undefined): string | undefined {
  const base = configDir ?? home

  return base === undefined ? undefined : `${base}/.claude.json`
}

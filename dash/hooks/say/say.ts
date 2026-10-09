/**
 * Which language the mod speaks.
 *
 * Adding one takes three lines: `hooks/say/<tag>.ts` with the lines it
 * translates, one entry in `LANGUAGES`, and one string in the manifest's
 * `language` options so `/config` offers it. A line a translation leaves
 * out is drawn in English.
 *
 * The language is settled once, at `register`, and never changes for the
 * life of the module: writing the `/config` row reloads the module, which
 * settles it again from the new option.
 */

import { DE } from './de'
import { EN } from './en'
import type { PartialTexts, Texts } from './en'
import { ES } from './es'
import { FR } from './fr'

/**
 * Every language the mod has, by the tag `/config` offers.
 */
export const LANGUAGES: Readonly<Record<string, PartialTexts>> = {
  en: {},
  fr: FR,
  es: ES,
  de: DE,
}

/**
 * The bundle a tag names: its own lines over the English ones. A tag no
 * file answers to is English.
 *
 * @param tag the language, as the option holds it
 * @returns the complete bundle
 */
export function sayOf(tag: unknown): Texts {
  const some = LANGUAGES[String(tag ?? '').trim().toLowerCase()]

  if (some === undefined) {
    return EN
  }

  return { ...EN, ...some, taglines: { ...EN.taglines, ...some.taglines } }
}

/**
 * The bundle this module draws in.
 */
let current: Texts = EN

/**
 * Settles the language for this module.
 *
 * @param tag the language, as the option holds it
 */
export function setSay(tag: unknown): void {
  current = sayOf(tag)
}

/**
 * The lines to draw with.
 *
 * @returns the bundle
 */
export const say = (): Texts => current

import { describe, expect, test } from 'claude-code/testing'

import {
  DEFAULT_PREFS,
  EN,
  prefKeyOf,
  prefsLines,
  prefsOf,
  setRequestOf,
  withPref,
  MODELS,
  catalogOf,
  presetPartOf,
  withoutPreset,
  isOwnPreset,
  fastStateOf,
  contextGaugeOf,
  contextPercentOf,
  choiceOf,
  dotOf,
  effortOf,
  gaugeOf,
  cappedScriptOf,
  hotkeysOf,
  FIXED_HOTKEYS,
  savedEffortOf,
  idleReasonOf,
  labelOf,
  pickOf,
  planOf,
  presetOf,
  presetText,
  sayOf,
  switchedText,
  versionOf,
} from '../hooks'

const OPUS = MODELS[1]!
const HAIKU = MODELS[3]!

describe('the catalog', () => {
  test('a model id maps back to its own id first, then its family', async () => {
    expect(choiceOf('claude-opus-5-5')?.key).toBe('opus')
    expect(choiceOf('claude-fable-5-1')?.key).toBe('fable')
    expect(choiceOf('claude-haiku-4-5-20251001')?.hasEffort).toBe(false)
    expect(choiceOf('gpt-6')).toBeUndefined()
    expect(choiceOf(undefined)).toBeUndefined()

    const { models } = catalogOf({ models: 'claude-opus-4-1=Opus 4.1' })

    expect(choiceOf('claude-opus-4-1-20250805', models)?.label).toBe('Opus 4.1')
    expect(choiceOf('claude-opus-5-5', models)?.key).toBe('opus')
  })

  test('the current row names the version its id carries', async () => {
    expect(versionOf('claude-opus-5-5')).toBe('5.5')
    expect(versionOf('claude-haiku-4-5-20251001')).toBe('4.5')
    expect(versionOf('claude-opus-5-5[1m]')).toBe('5.5')
    expect(versionOf('opus')).toBeUndefined()
    expect(labelOf(OPUS, 'claude-opus-5-5', true)).toBe('Opus 5.5')
    expect(labelOf(OPUS, 'claude-opus-5-5', false)).toBe('Opus')
    expect(labelOf({ ...OPUS, label: 'Opus 4.1' }, 'claude-opus-4-1', true)).toBe('Opus 4.1')
  })

  test('only the five levels read as an effort', async () => {
    expect(effortOf('xhigh')).toBe('xhigh')
    expect(effortOf(3)).toBeUndefined()
    expect(effortOf('extreme')).toBeUndefined()
  })

  test('/dash names a model, an effort, a preset, or none', async () => {
    const quick = { key: 'quick', model: HAIKU }

    expect(pickOf(' Opus ')).toEqual({ model: expect.objectContaining({ arg: 'opus' }) })
    expect(pickOf('claude-fable-5-1')).toEqual({ model: expect.objectContaining({ key: 'fable' }) })
    expect(pickOf('max')).toEqual({ effort: 'max' })
    expect(pickOf('quick', MODELS, [quick])).toEqual({ preset: quick })
    expect(pickOf('')).toBeUndefined()
    expect(pickOf('turbo')).toBeUndefined()
  })

  test('the current value has the filled dot, and a level as many filled cells as its rank', async () => {
    expect(dotOf(true)).toBe('●')
    expect(dotOf(false)).toBe('○')
    expect(gaugeOf('low')).toEqual({ filled: '▰', empty: '▱▱▱▱' })
    expect(gaugeOf('max')).toEqual({ filled: '▰▰▰▰▰', empty: '' })
  })

  test('the notification names the values before and after', async () => {
    expect(switchedText('model', 'Opus', 'Sonnet')).toBe('⇄ Model Opus → Sonnet')
    expect(switchedText('effort', undefined, 'max')).toBe('⚡ Effort → max')
    expect(switchedText('effort', 'high', 'high')).toBe('⚡ Effort already on high')
    expect(presetText({ key: 'deep', model: OPUS, effort: 'xhigh' }, [['Sonnet', 'Opus'], ['medium', 'xhigh']])).toBe(
      '◇ Preset deep: Sonnet → Opus, medium → xhigh',
    )
    expect(presetText({ key: 'quick', model: HAIKU }, [])).toBe('◇ Preset quick: already on Haiku')
  })

  test('a pick plans only what it changes, and nothing on the current value or under Haiku', async () => {
    const deep = { preset: { key: 'deep', model: OPUS, effort: 'xhigh' as const } }

    expect(planOf(deep, 'claude-sonnet-5-5', 'medium')).toEqual({ model: OPUS, effort: 'xhigh' })
    expect(planOf(deep, 'claude-opus-5-5', 'medium')).toEqual({ effort: 'xhigh' })
    expect(planOf({ preset: { key: 'x', model: HAIKU, effort: 'max' } }, 'claude-opus-5-5', 'high')).toEqual({ model: HAIKU })

    expect(idleReasonOf({ model: OPUS }, 'claude-opus-5-5', 'high')).toBe('⇄ Model already on Opus')
    expect(idleReasonOf({ model: OPUS }, 'claude-sonnet-5-5', 'high')).toBeUndefined()
    expect(idleReasonOf({ effort: 'high' }, 'claude-opus-5-5', 'high')).toBe('⚡ Effort already on high')
    expect(idleReasonOf({ effort: 'max' }, 'claude-haiku-4-5-20251001', undefined)).toBe(EN.noEffort)
    expect(idleReasonOf({ effort: 'max' }, undefined, undefined)).toBeUndefined()
    expect(idleReasonOf(deep, 'claude-opus-5-5', 'xhigh')).toBe('◇ Preset deep: already on Opus · xhigh')
  })

  test('a capped script counts its agents right after meta, braces in strings skipped', async () => {
    const script = "export const meta = {\n  name: 'x', description: 'a } b',\n  phases: [{ title: 'T' }],\n}\nreturn await agent('go')"
    const capped = cappedScriptOf(script, 2) ?? ''

    expect(capped.startsWith(script.slice(0, script.indexOf('\nreturn')))).toBe(true)
    expect(capped).toContain('++started > 2')
    expect(capped.indexOf('++started')).toBeLessThan(capped.indexOf("agent('go')"))
    expect(cappedScriptOf("return await agent('go')", 2)).toBeUndefined()
  })

  test('comments mislead the scan neither inside meta nor before it', async () => {
    const body = "\nreturn await agent('go')"
    const metas = [
      "export const meta = {\n  name: 'x', // closes }\n  description: 'y',\n}",
      "export const meta = {\n  name: 'x', // don't touch\n  description: 'y',\n}",
      "// usage: export const meta = { name } is required\nexport const meta = { name: 'x', description: 'y' }",
      "/* template: export const meta = { name: 'n' } */\nexport const meta = { name: 'x', description: 'y' }",
    ]

    for (const meta of metas) {
      const capped = cappedScriptOf(meta + body, 1) ?? ''

      // The counter lands right after the real literal, nowhere else.
      expect(capped).toBe(meta + capped.slice(meta.length, capped.indexOf(body)) + body)
      expect(capped.slice(meta.length)).toMatch(/^\n;\{ let started = 0;/)
    }
  })

  test('a capped script refuses nested workflows, and a cap below 1 caps nothing', async () => {
    const script = "export const meta = { name: 'x', description: 'y' }\nreturn 1"

    expect(cappedScriptOf(script, 3)).toContain('workflow = () => Promise.reject')
    expect(cappedScriptOf(script, 0)).toBeUndefined()
  })

  test('the saved level is the model’s own, by id, alias or suffixed id, else the top-level one', async () => {
    const settings = { effortLevel: 'low', modelSettings: { 'claude-opus-5-5': { effortLevel: 'xhigh' } } }

    expect(savedEffortOf(settings, 'claude-opus-5-5')).toBe('xhigh')
    expect(savedEffortOf(settings, 'opus')).toBe('xhigh')
    expect(savedEffortOf(settings, 'claude-opus-5-5[1m]')).toBe('xhigh')
    expect(savedEffortOf(settings, 'claude-sonnet-5-5')).toBe('low')
    expect(savedEffortOf({}, 'opus')).toBeUndefined()
  })

  test('the hotkeys run digits then letters, models, levels, presets, fast mode, the fixed letters left out', async () => {
    const keys = hotkeysOf({ models: 4, efforts: 5, presets: 3, fast: true, ultracode: true })

    expect(keys.models).toEqual(['1', '2', '3', '4'])
    expect(keys.efforts).toEqual(['5', '6', '7', '8', '9'])
    expect(keys.presets).toEqual(['b', 'd', 'e'])
    expect(keys.fast).toBe('f')
    expect(keys.ultracode).toBe('i')

    // No run letter is a fixed one or a library one.
    const run = [...keys.models, ...keys.efforts, ...keys.presets, keys.fast, keys.ultracode]
    const fixed = [...Object.values(FIXED_HOTKEYS), 'a', 'c', 's', 'p', 'm', 'h']
    expect(run.filter(key => fixed.includes(key as string))).toEqual([])
    expect(new Set(fixed).size).toBe(fixed.length)
  })
})

describe('the options', () => {
  test('models are added and hidden; a part that does not read is set aside', async () => {
    const catalog = catalogOf({ models: 'claude-fable-5-2=Fable 5.2, Bad Id, opus', hideModels: 'fable' })

    expect(catalog.models.map(one => one.key)).toEqual(['opus', 'sonnet', 'haiku', 'claude-fable-5-2'])
    expect(catalog.models.at(-1)).toEqual(expect.objectContaining({ label: 'Fable 5.2', arg: 'claude-fable-5-2', hasEffort: true }))
    expect(catalog.ignored).toEqual(['Bad Id', 'opus'])
  })

  test('presets read name=model/effort or name=model, and refuse a shadowed name', async () => {
    expect(presetOf('deep=opus/xhigh', MODELS)).toEqual({ key: 'deep', model: OPUS, effort: 'xhigh' })
    expect(presetOf('quick=haiku', MODELS)).toEqual({ key: 'quick', model: HAIKU })
    expect(presetOf('opus=opus/high', MODELS)).toBeUndefined()
    expect(presetOf('max=opus/high', MODELS)).toBeUndefined()
    expect(presetOf('x=gpt/high', MODELS)).toBeUndefined()
    expect(presetOf('x=opus/turbo', MODELS)).toBeUndefined()

    const catalog = catalogOf({ presets: 'deep=opus/xhigh, deep=sonnet, quick=haiku' })

    expect(catalog.presets.map(one => one.key)).toEqual(['deep', 'quick'])
    expect(catalog.ignored).toEqual(['deep=sonnet'])
  })

  test('settings read from the store fall back to their defaults, and set one at a time', async () => {
    expect(prefsOf(undefined)).toEqual(DEFAULT_PREFS)
    expect(prefsOf({ language: 'fr', presets: 3 })).toEqual({ ...DEFAULT_PREFS, language: 'fr' })

    expect(setRequestOf('opus')).toBeUndefined()
    expect(setRequestOf(' set ')).toEqual({})
    expect(setRequestOf('set presets fast=haiku, deep=opus/max')).toEqual({ key: 'presets', value: 'fast=haiku, deep=opus/max' })
    expect(prefKeyOf('HIDEMODELS')).toBe('hideModels')
    expect(prefKeyOf('colour')).toBeUndefined()

    expect(withPref(DEFAULT_PREFS, 'language', 'FR')).toEqual({ prefs: { ...DEFAULT_PREFS, language: 'fr' } })
    expect(withPref(DEFAULT_PREFS, 'language', 'xx')).toEqual({ error: 'language' })
    expect(withPref({ ...DEFAULT_PREFS, presets: 'a=opus' }, 'presets', '')).toEqual({ prefs: DEFAULT_PREFS })
    expect(prefsLines(DEFAULT_PREFS)).toContain('models = —')
    expect(presetOf('set=opus', MODELS)).toBeUndefined()
  })

  test('a language takes its own lines over the English ones; an unknown tag is English', async () => {
    expect(sayOf('fr').models).toBe('Modèle')
    expect(sayOf('de').taglines['opus']).toBe('gründlich')
    expect(sayOf('xx')).toBe(EN)
    expect(sayOf(undefined).models).toBe('Model')
  })
})

describe('a new preset', () => {
  test('reads as name=model/effort, the level left out for a model without one, and refuses a bad or taken name', async () => {
    const { models, presets } = catalogOf(DEFAULT_PREFS)

    expect(presetPartOf({ name: 'Review', model: 'sonnet', effort: 'high' }, models, presets)).toEqual({ part: 'review=sonnet/high' })
    expect(presetPartOf({ name: 'fast-one', model: 'haiku', effort: 'max' }, models, presets)).toEqual({ part: 'fast-one=haiku' })
    expect(presetPartOf({ name: 'my preset', model: 'opus', effort: '' }, models, presets)).toEqual({ error: 'name' })
    expect(presetPartOf({ name: 'opus', model: 'opus', effort: '' }, models, presets)).toEqual({ error: 'name' })
    expect(presetPartOf({ name: 'deep', model: 'opus', effort: '' }, models, presets)).toEqual({ error: 'exists' })
  })
})

describe('fast mode', () => {
  test('its state is read from what /fast answered', async () => {
    expect(fastStateOf('Fast mode ON')).toBe(true)
    expect(fastStateOf('Fast mode OFF')).toBe(false)
    expect(fastStateOf('Fast mode is not available')).toBeUndefined()
    expect(fastStateOf(undefined)).toBeUndefined()
  })
})

describe('the context gauge', () => {
  test('fills one cell in twenty per 5 %, capped', async () => {
    expect(contextGaugeOf(13)).toEqual({ filled: '▰▰', empty: '▱'.repeat(11) })
    expect(contextGaugeOf(65).filled).toBe('▰'.repeat(8))
    expect(contextGaugeOf(120)).toEqual({ filled: '▰'.repeat(13), empty: '' })
  })
})

describe('the context percent', () => {
  test('is the tokens over the window to the hundredth, with a decimal comma', async () => {
    expect(contextPercentOf({ percent: 33, tokens: 332_600, window: 1_000_000 })).toEqual({ value: 33.26, text: '33,26' })
    expect(contextPercentOf({ percent: 13, window: 200_000 }).text).toBe('13,00')
  })
})

describe('deleting a preset', () => {
  test('drops its part alone, and only the person\'s own count', async () => {
    expect(withoutPreset('deep=opus/xhigh, review=sonnet/high, quick=haiku', 'review')).toBe('deep=opus/xhigh, quick=haiku')
    expect(withoutPreset('Review=sonnet', 'review')).toBe('')
    expect(isOwnPreset('review', DEFAULT_PREFS.presets)).toBe(true)
    expect(isOwnPreset('deep', DEFAULT_PREFS.presets)).toBe(false)
  })
})

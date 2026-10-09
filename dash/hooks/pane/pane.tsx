/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
/**
 * The pane's tree: one framed list of models, one of effort levels and one
 * of presets, a row each, so it holds in a narrow dock. Each model has its
 * color, each level a gauge running cool to hot; the current row carries a
 * filled dot and full strength, the others a hollow one and dim; each row
 * shows its hotkey. What a switch costs is said by its toast, not here.
 */

import type { ConfigRow, ConfigValue, EngineInterface, RenderElement, RenderSurface } from 'claude-code'

import { EFFORTS, EFFORT_COLORS, FIXED_HOTKEYS, MORE_MODELS, choiceOf, contextGaugeOf, contextPercentOf, gaugeOf, hotkeysOf, labelOf, presetLabelOf } from '../catalog'
import type { Effort, ModelChoice, Preset } from '../catalog'
import type { PresetDraft } from '../config'
import { AGENT_SCOPES } from '../agents'
import type { AgentScope } from '../agents'
import { ENTRIES_SHOWN, LIBRARY_COLORS, LIBRARY_HOTKEYS, LIBRARY_KINDS, isToggleKind, shownOf } from '../library'
import type { Library, LibraryKind } from '../library'
import { RENAME_EDIT_KEY, NEW_PRESET_KEY, presetDeleteKey, PRESET_ADD_KEY, PRESET_EFFORT_KEY, PRESET_MODEL_KEY, PRESET_NAME_KEY } from '../names'
import { COMPACT_CANCEL_KEY, COMPACT_CONFIRM_KEY, COMPACT_KEY, COMPACT_NOTE_KEY, CONFIG_KEY, FAST_KEY, KEYBOARD_KEY, RELOAD_KEY, RENAME_KEY, configKey, menuOptionKey, MORE_MODELS_KEY, ULTRACODE_KEY, effortKey, entryKey, frameToggleKey, modelKey, presetKey, sectionKey } from '../names'
import { BAND_COMPACT_CANCEL_KEY, BAND_COMPACT_CONFIRM_KEY, BAND_COMPACT_KEY, COMPACT_MODE_KEY, bandKey } from '../names'
import { say } from '../say'
import type { BandPart } from '../settings'
import { durationText, limitLabelOf, percentText, usageColorOf } from '../usage'
import type { UsageView } from '../usage'

/**
 * The elements of the surface the pane is drawn on.
 */
export type Elements = ReturnType<EngineInterface['ui']['resolve']>

/** The frame's color where no model is known. */
const NEUTRAL = '#888888'

/** The presets frame's color while no preset matches the session. */
const PRESET_COLOR = '#c084fc'

/** The fast mode's frame color. */
const FAST_COLOR = '#fca5a5'

/** The ultracode frame's color. */
const ULTRACODE_COLOR = '#f59e0b'

/** The color a delete button takes under the pointer. */
const DELETE_COLOR = '#f87171'

/** The Library frame's color: neutral, its rows carry their own. */
const LIBRARY_FRAME_COLOR = '#94a3b8'

/** The Settings section's color. */
const CONFIG_COLOR = '#facc15'

/**
 * A Button's hover: its label in that color under the pointer. The scope is
 * the Button's own key, so it lights alone and needs no keyed Box around it.
 *
 * @param key the Button's key
 * @param color the color
 * @returns the hover props
 */
const lit = (key: string, color: string) => ({ scope: key.slice(0, 64), color })

/** The Session frame's color. */
const SESSION_COLOR = '#f472b6'

/** The width labels are padded to, so the taglines and gauges line up. */
const LABEL_WIDTH = 10

/** The empty segments' color in a drawn gauge. */
const TRACK_COLOR = '#80808040'

/**
 * A gauge drawn as an SVG, for the surfaces that draw one (the terminal does
 * not): `filled` segments of `total` in that color, the rest a faint track;
 * one segment alone is a continuous bar filled to `filled`, read as a share.
 *
 * @param filled the segments filled, or the share filled where `total` is 1
 * @param total the segments
 * @param color the filled segments' color
 * @param isDim whether the gauge is drawn faint, as a row not current
 * @returns the SVG document
 */
export function gaugeSvgOf(filled: number, total: number, color: string, isDim: boolean): string {
  const height = 8
  const opacity = isDim ? 0.4 : 1

  if (total === 1) {
    const width = 107
    const share = Math.max(0, Math.min(1, filled))

    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect width="${width}" height="${height}" rx="4" fill="${TRACK_COLOR}"/>` +
      (share > 0 ? `<rect width="${Math.max(height, share * width).toFixed(1)}" height="${height}" rx="4" fill="${color}" opacity="${opacity}"/>` : '') +
      '</svg>'
    )
  }

  const segment = 12
  const gap = 3
  const width = total * segment + (total - 1) * gap
  const rects = Array.from({ length: total }, (_, index) => {
    const fill = index < filled ? `fill="${color}" opacity="${opacity}"` : `fill="${TRACK_COLOR}"`

    return `<rect x="${index * (segment + gap)}" width="${segment}" height="${height}" rx="2" ${fill}/>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects}</svg>`
}

/**
 * A row's dot: filled when it names the current value.
 *
 * @param isCurrent whether the row names the current value
 * @returns the dot
 */
export function dotOf(isCurrent: boolean): string {
  return isCurrent ? '●' : '○'
}

/**
 * A frame's rows in compact mode: its current one alone, or its first
 * where none is current; all of them otherwise.
 *
 * @param list the rows
 * @param current the current row, where the list holds one
 * @param isCompact whether compact mode is on
 * @returns the rows to draw
 */
export function foldedOf<T>(list: readonly T[], current: T | undefined, isCompact: boolean): readonly T[] {
  if (!isCompact) {
    return list
  }

  const kept = current !== undefined && list.includes(current) ? current : list[0]

  return list.filter(one => one === kept)
}

/** The gauges' cells in the band, half the pane's: the band is one row. */
const BAND_CELLS = 7

/**
 * What the pane draws and what its buttons do.
 */
export type PaneView = {
  /** The models the pane offers. */
  models: readonly ModelChoice[]
  /** The presets the pane offers. */
  presets: readonly Preset[]
  /** The session's model id, as the engine last reported it. */
  model: string | undefined
  /** The effort the last request went with, or the one asked for since. */
  effort: Effort | undefined
  /** False when the session has no `/effort`: the mod holds the level itself. */
  hasEffortCommand: boolean
  /** True while the effort shown was asked for and no request has carried it yet. */
  isEffortAsked: boolean
  /** True when the session has `/fast`, which the pane then toggles. */
  hasFast: boolean
  /** True once the mod turned ultracode on, until it turns it off. */
  isUltracode: boolean
  /** The parts of the options set aside. */
  ignored: readonly string[]
  /** Switches to the model of that key. */
  pickModel: (key: string) => void
  /** Switches to that effort level. */
  pickEffort: (level: Effort) => void
  /** Applies the preset of that key. */
  pickPreset: (key: string) => void
  /** Fast mode's state, where a /fast output told it. */
  isFast: boolean | undefined
  /** Runs `/fast`. */
  toggleFast: () => void
  /** Runs `/effort ultracode`, or `/effort ultracode off` where it is on. */
  toggleUltracode: () => void
  /** Switches to a model of the drop-down, by id. */
  pickMoreModel: (id: string) => void
  /** The person's agents, commands and skills, global and the project's. */
  library: Library
  /** What the prompt box opens with, by kind: an agent's mention, a command. */
  current: Partial<Record<LibraryKind, string>>
  /** The sections the person opened. */
  openKinds: readonly LibraryKind[]
  /** Opens or closes a section. */
  toggleKind: (kind: LibraryKind) => void
  /** The scope frames the person expanded, as `<kind>:<scope>`. */
  expandedFrames: readonly string[]
  /** Expands or collapses one scope frame. */
  toggleFrame: (kind: LibraryKind, scope: AgentScope) => void
  /** Puts that entry at the head of the prompt box, or turns a plugin or a server on or off. */
  pickEntry: (kind: LibraryKind, name: string) => void
  /** The live context window, as the status line reads it; nothing before it is known. */
  context: { percent?: number; tokens?: number; window: number } | undefined
  /** The session's cost, its duration and the rate-limit windows; nothing before they are read. */
  usage: UsageView | undefined
  /** Runs `/rename <name>`. */
  renameSession: (name: string) => void
  /** The session's name, once /rename gave one. */
  sessionName: string | undefined
  /** Whether the rename field is open again over a named session. */
  isRenaming: boolean
  /** Opens the rename field again. */
  editName: () => void
  /** Whether `/compact` waits for its confirmation. */
  isCompactAsked: boolean
  /** Asks for `/compact`, or drops it. */
  askCompact: (isAsked: boolean) => void
  /** The instructions typed for `/compact`. */
  compactNote: string
  /** Keeps them as they are typed. */
  setCompactNote: (note: string) => void
  /** Runs `/compact` with them, once confirmed. */
  compact: () => void
  /** The rows of `/config`, in its order. */
  configRows: readonly ConfigRow[]
  /** Changes one `/config` row. */
  setConfig: (key: string, value: ConfigValue) => void
  /** Whether the rows show and bind their hotkeys. */
  isKeyboard: boolean
  /** Shows or hides the hotkeys. */
  toggleKeyboard: () => void
  /** Whether the lists are folded onto their current row. */
  isCompact: boolean
  /** Folds or unfolds them. */
  toggleCompact: () => void
  /** What the band above the prompt shows. */
  band: readonly BandPart[]
  /** Puts a frame's values in the band, or takes them out. */
  toggleBand: (part: BandPart) => void
  /** The preset being composed: its name, model and level. */
  draftPreset: PresetDraft
  /** Changes a piece of it. */
  setDraftPreset: (patch: Partial<PresetDraft>) => void
  /** Adds it to the presets. */
  addPreset: () => void
  /** The presets that are the person's own, which a click deletes. */
  ownPresets: readonly string[]
  /** Deletes one of them. */
  deletePreset: (key: string) => void
  /** The drop-downs the person opened, by key. */
  openMenus: readonly string[]
  /** Opens or closes a drop-down. */
  toggleMenu: (key: string) => void
  /** Whether a plugin was turned on or off since the last `/reload-plugins`. */
  isReloadPending: boolean
  /** Runs `/reload-plugins`. */
  reloadPlugins: () => void
}

/**
 * Draws the pane.
 *
 * @param ui the surface's elements
 * @param view the current values and the switches
 * @param surface the surface drawing it, as `e.surface` names it
 * @returns the pane's tree
 */
export function drawPane(ui: Elements, view: PaneView, surface: RenderSurface = 'terminal'): RenderElement {
  const { Box, Button, Text } = ui
  // The mobile surface has no Input: the field is left out there.
  const Input = 'Input' in ui ? ui.Input : undefined
  // The graphic surfaces (desktop, the editor's webview, mobile) draw an SVG
  // and set text in a proportional font; the terminal does neither, and keeps
  // its glyph gauges and padded labels. Told by the surface's name: the
  // terminal's table can carry an Svg it does not draw.
  const Svg = surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined
  // Where the surface's Select takes a click (desktop, the editor's webview),
  // the drop-downs are its own instead of the pane's rows of buttons.
  const Select = Svg !== undefined && 'Select' in ui ? ui.Select : undefined
  const texts = say()
  // The space between stacked frames (effort, ultracode, fast mode): a row
  // on the graphic surfaces, where their borders would otherwise touch;
  // none in the terminal, where a row is a whole line.
  const frameGap = Svg === undefined ? 0 : 1
  // A label of the aligned column: padded in the terminal's cells, in a Box
  // of that width where the font is proportional.
  const labelled = (label: string, button: (text: string) => RenderElement): RenderElement =>
    Svg === undefined ? button(label.padEnd(LABEL_WIDTH)) : <Box width={LABEL_WIDTH}>{button(label)}</Box>
  // A gauge: an SVG where the surface draws one, the glyphs otherwise.
  const gauge = (filled: number, total: number, color: string, isDim: boolean, alt: string, glyphs: () => RenderElement): RenderElement =>
    Svg === undefined ? glyphs() : <Svg source={gaugeSvgOf(filled, total, color, isDim)} alt={alt} />

  const fill =
    view.context?.percent === undefined ? undefined : contextPercentOf({ ...view.context, percent: view.context.percent })
  // The rate-limit windows, drawn under the context's gauge; in the terminal
  // their labels are padded to the longest so the gauges line up.
  const limits = view.usage?.limits ?? []
  const gaugeWidth = Math.max(texts.context.length, ...limits.map(limit => limitLabelOf(limit.kind).length))
  const gaugeLabel = (label: string): string => label.padEnd(gaugeWidth)

  // A fixed hotkey, bound in keyboard mode alone.
  const fixed = (name: keyof typeof FIXED_HOTKEYS): string | undefined => (view.isKeyboard ? FIXED_HOTKEYS[name] : undefined)

  // By a frame's title: puts its values in the band above the prompt, or
  // takes them out; dim while they are not there.
  const pin = (part: BandPart, color: string): RenderElement => (
    <Button key={bandKey(part)} hover={lit(bandKey(part), color)} plain dimColor={!view.band.includes(part)} onPress={() => view.toggleBand(part)}>
      ↧
    </Button>
  )

  // A row of the Library frame the person opens and closes, like the library's.
  const section = (key: string, color: string, title: string, count: number | undefined, body: RenderElement, hotkey?: string) => {
    const isOpen = view.openMenus.includes(key)

    return (
      <Box key={`section:${key}`} flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text bold color={color}>
            {isOpen ? '▾' : '▸'}
          </Text>
          <Button key={key} hover={lit(key, color)} plain hotkey={hotkey} onPress={() => view.toggleMenu(key)}>
            {title}
          </Button>
          {count !== undefined && <Text color={color}>{count}</Text>}
        </Box>
        {isOpen && (
          <Box flexDirection="column" borderStyle="round" borderColor={color} borderDimColor paddingX={1}>
            {body}
          </Box>
        )}
      </Box>
    )
  }

  // One `/config` row, drawn by its kind: a switch, a drop-down, a field; a
  // row a policy locks, or a list, is shown and left alone.
  const configControl = (row: ConfigRow): RenderElement => {
    const key = configKey(row.key)
    const shown = (
      <Box key={`row:${key}`}>
        <Text dimColor wrap="truncate-end">
          {row.isLocked ? '🔒 ' : ''}
          {row.label}: {Array.isArray(row.value) ? row.value.join(', ') : String(row.value)}
        </Text>
      </Box>
    )

    if (row.isLocked || Array.isArray(row.value)) {
      return shown
    }

    if (row.kind === 'boolean') {
      return (
        <Box key={`row:${key}`} flexDirection="row" gap={1}>
          <Text>{dotOf(row.value === true)}</Text>
          <Button key={key} hover={lit(key, CONFIG_COLOR)} plain dimColor={row.value !== true} onPress={() => view.setConfig(row.key, row.value !== true)}>
            {row.label}
          </Button>
        </Box>
      )
    }

    // Named apart from `options`, which the manifest check reads as the plugin's own.
    const { options: choices = [] } = row.kind === 'choice' ? row : {}

    if (row.kind === 'choice' && choices.length > 0) {
      return menu(
        key,
        row.label,
        choices.map(one => ({ value: one, label: one })),
        String(row.value),
        value => view.setConfig(row.key, value),
        CONFIG_COLOR,
      )
    }

    if (Input === undefined) {
      return shown
    }

    return (
      <Input
        key={key}
        label={row.label}
        value={String(row.value)}
        onSubmit={(text: string) => {
          const value = row.kind === 'number' ? Number(text) : text

          if (typeof value !== 'number' || Number.isFinite(value)) {
            view.setConfig(row.key, value)
          }
        }}
      />
    )
  }
  // The surface's Select takes no click on its options in the terminal: the
  // pane draws its own drop-down, a button that opens a row of buttons.
  const menu = (
    key: string,
    label: string,
    choices: readonly { value: string; label: string }[],
    value: string | undefined,
    pick: (value: string) => void,
    color: string,
    hotkey?: string,
  ): RenderElement => {
    const isOpen = view.openMenus.includes(key)
    const chosen = choices.find(one => one.value === value)

    if (Select !== undefined) {
      // Nothing chosen: a blank first option, so a pick of the first real one
      // still changes the value and reaches onSelect.
      const options = chosen === undefined ? [{ value: '', label: '—' }, ...choices] : choices

      return (
        <Select
          key={key}
          label={label}
          options={options}
          value={chosen?.value ?? ''}
          onSelect={(picked: string) => {
            if (chosen !== undefined || picked !== '') {
              pick(picked)
            }
          }}
        />
      )
    }

    return (
      <Box key={`menu:${key}`} flexDirection="column">
        <Button key={key} hover={lit(key, color)} plain hotkey={hotkey} onPress={() => view.toggleMenu(key)}>
          {`${label}: ${chosen?.label ?? '—'} ${isOpen ? '▴' : '▾'}`}
        </Button>
        {isOpen &&
          choices.map(one => (
            <Box key={`row:${menuOptionKey(key, one.value)}`} flexDirection="row" gap={1} paddingLeft={2}>
              <Text>{dotOf(one.value === value)}</Text>
              <Button
                key={menuOptionKey(key, one.value)} hover={lit(menuOptionKey(key, one.value), color)}
                plain
                dimColor={one.value !== value}
                onPress={() => {
                  view.toggleMenu(key)
                  pick(one.value)
                }}
              >
                {one.label}
              </Button>
            </Box>
          ))}
      </Box>
    )
  }
  const current = choiceOf(view.model, view.models)
  const hasEffort = current?.hasEffort ?? true
  const accent = current?.color ?? NEUTRAL
  const heat = view.effort === undefined ? NEUTRAL : EFFORT_COLORS[view.effort]
  // Keyboard mode off: no row takes a hotkey, so none is drawn or bound.
  const keys = hotkeysOf(
    view.isKeyboard
      ? {
          models: view.models.length,
          efforts: EFFORTS.length,
          presets: view.presets.length,
          fast: view.hasFast,
          ultracode: view.hasEffortCommand,
        }
      : { models: 0, efforts: 0, presets: 0, fast: false },
  )
  const currentPreset = view.presets.find(
    (preset) =>
      preset.model.key === current?.key &&
      (preset.effort === undefined || !preset.model.hasEffort || preset.effort === view.effort),
  )
  const presetAccent = currentPreset?.model.color ?? PRESET_COLOR
  const scopeNames: Record<AgentScope, string> = {
    user: texts.scopeUser,
    project: texts.scopeProject,
  }
  const kindNames: Record<LibraryKind, string> = {
    agents: texts.agents,
    commands: texts.commands,
    skills: texts.skills,
    plugins: texts.plugins,
    mcp: texts.mcp,
    hooks: texts.hooks,
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Text bold color={accent}>
          ◆ {texts.models}
        </Text>
        {pin('model', accent)}
        <Text dimColor wrap="truncate-end">
          {view.model ?? texts.unknown}
        </Text>
      </Box>
      <Box flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1}>
        {foldedOf(view.models, view.models.find(one => one.key === current?.key), view.isCompact).map(one => {
          const isCurrent = one.key === current?.key
          const index = view.models.indexOf(one)

          return (
            <Box key={`row:${modelKey(one.key)}`} flexDirection="row" gap={1}>
              <Text color={one.color}>{dotOf(isCurrent)}</Text>
              {labelled(labelOf(one, view.model, isCurrent), label => (
                <Button
                  key={modelKey(one.key)} hover={lit(modelKey(one.key), one.color)}
                  plain
                  hotkey={keys.models[index]}
                  dimColor={!isCurrent}
                  onPress={() => view.pickModel(one.key)}
                >
                  {label}
                </Button>
              ))}
              <Text color={isCurrent ? one.color : undefined} dimColor={!isCurrent} italic>
                {texts.taglines[one.key] ?? ''}
              </Text>
            </Box>
          )
        })}
        {!view.isCompact &&
          menu(
            MORE_MODELS_KEY,
            texts.moreModels,
            MORE_MODELS.map(one => ({ value: one.id, label: one.label })),
            MORE_MODELS.some(one => one.id === view.model) ? view.model : undefined,
            view.pickMoreModel,
            accent,
            fixed('moreModels'),
          )}
      </Box>

      <Box key="head:effort" flexDirection="row" gap={1} marginTop={1}>
        <Text bold color={heat}>
          ⚡ {texts.efforts}
        </Text>
        {pin('effort', heat)}
        <Text dimColor>{hasEffort ? view.effort ?? texts.unknown : texts.noEffortShort}</Text>
        {hasEffort && view.isEffortAsked && (
          <Text dimColor italic>
            ({texts.asked})
          </Text>
        )}
      </Box>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={hasEffort ? heat : NEUTRAL}
        borderDimColor={!hasEffort}
        paddingX={1}
      >
        {foldedOf(EFFORTS, view.effort, view.isCompact).map(level => {
          const isCurrent = level === view.effort
          const glyphs = gaugeOf(level)
          const index = EFFORTS.indexOf(level)

          return (
            <Box key={`row:${effortKey(level)}`} flexDirection="row" gap={1}>
              <Text color={EFFORT_COLORS[level]} dimColor={!hasEffort}>
                {dotOf(isCurrent)}
              </Text>
              {hasEffort
                ? labelled(level, label => (
                    <Button
                      key={effortKey(level)} hover={lit(effortKey(level), EFFORT_COLORS[level])}
                      plain
                      hotkey={keys.efforts[index]}
                      dimColor={!isCurrent}
                      onPress={() => view.pickEffort(level)}
                    >
                      {label}
                    </Button>
                  ))
                : // No Button has a disabled state: a model without effort
                  // draws the levels as text, which nothing can press.
                  labelled(level, label => <Text dimColor>{Svg === undefined ? `   ${label}` : label}</Text>)}
              {gauge(EFFORTS.indexOf(level) + 1, EFFORTS.length, EFFORT_COLORS[level], !hasEffort || !isCurrent, level, () => (
                <Text>
                  <Text color={EFFORT_COLORS[level]} dimColor={!hasEffort || !isCurrent}>
                    {glyphs.filled}
                  </Text>
                  <Text dimColor>{glyphs.empty}</Text>
                </Text>
              ))}
            </Box>
          )
        })}
      </Box>
      {!hasEffort && <Text dimColor>{texts.noEffort}</Text>}
      {!view.hasEffortCommand && <Text dimColor>{texts.heldEffort}</Text>}

      {view.hasEffortCommand && (
        <Box key="head:ultracode" flexDirection="row" gap={1} borderStyle="round" borderColor={ULTRACODE_COLOR} paddingX={1} marginTop={frameGap}>
          <Text bold color={ULTRACODE_COLOR}>
            ✦
          </Text>
          <Button
            key={ULTRACODE_KEY}
            hover={lit(ULTRACODE_KEY, ULTRACODE_COLOR)}
            plain
            hotkey={keys.ultracode}
            onPress={() => view.toggleUltracode()}
          >
            {texts.ultracode}
          </Button>
          <Text dimColor>{view.isUltracode ? texts.ultracodeOn : texts.ultracodeOff}</Text>
        </Box>
      )}

      {view.hasFast && (
        <Box key="head:fast" flexDirection="row" gap={1} borderStyle="round" borderColor={FAST_COLOR} paddingX={1} marginTop={frameGap}>
          <Text bold color={FAST_COLOR}>
            »
          </Text>
          <Button key={FAST_KEY} hover={lit(FAST_KEY, FAST_COLOR)} plain hotkey={keys.fast} onPress={() => view.toggleFast()}>
            {texts.fast}
          </Button>
          <Text dimColor>{view.isFast === undefined ? '—' : view.isFast ? texts.ultracodeOn : texts.ultracodeOff}</Text>
        </Box>
      )}

      <Box key="head:presets" flexDirection="row" gap={1} marginTop={1}>
        <Text bold color={presetAccent}>
          ◇ {texts.presets}
        </Text>
        {currentPreset !== undefined && <Text dimColor>{currentPreset.key}</Text>}
      </Box>
      <Box flexDirection="column" borderStyle="round" borderColor={presetAccent} paddingX={1}>
        {foldedOf(view.presets, currentPreset, view.isCompact).map(preset => {
          const isCurrent = preset === currentPreset
          const index = view.presets.indexOf(preset)

          return (
            <Box key={`row:${presetKey(preset.key)}`} flexDirection="row" gap={1}>
              <Text color={preset.model.color}>{dotOf(isCurrent)}</Text>
              {labelled(preset.key, label => (
                <Button
                  key={presetKey(preset.key)} hover={lit(presetKey(preset.key), preset.model.color)}
                  plain
                  hotkey={keys.presets[index]}
                  dimColor={!isCurrent}
                  onPress={() => view.pickPreset(preset.key)}
                >
                  {label}
                </Button>
              ))}
              <Text dimColor={!isCurrent} italic>
                {presetLabelOf(preset)}
              </Text>
              {view.ownPresets.includes(preset.key) && (
                <Button
                  key={presetDeleteKey(preset.key)}
                  hover={lit(presetDeleteKey(preset.key), DELETE_COLOR)}
                  plain
                  dimColor
                  onPress={() => view.deletePreset(preset.key)}
                >
                  ✕
                </Button>
              )}
            </Box>
          )
        })}
        {!view.isCompact && (
          <Button key={NEW_PRESET_KEY} hover={lit(NEW_PRESET_KEY, presetAccent)} plain dimColor hotkey={fixed('newPreset')} onPress={() => view.toggleMenu(NEW_PRESET_KEY)}>
            {view.openMenus.includes(NEW_PRESET_KEY) ? `▴ ${texts.newPreset}` : `+ ${texts.newPreset}`}
          </Button>
        )}
        {!view.isCompact && view.openMenus.includes(NEW_PRESET_KEY) && (
          <Box key="form:preset" flexDirection="column" paddingLeft={2}>
            {Input !== undefined && (
              <Input
                key={PRESET_NAME_KEY}
                label={texts.presetName}
                placeholder={texts.presetNameHint}
                value={view.draftPreset.name}
                onInput={(name: string) => view.setDraftPreset({ name })}
                onSubmit={(name: string) => {
                  view.setDraftPreset({ name })
                  view.addPreset()
                }}
              />
            )}
            {menu(
              PRESET_MODEL_KEY,
              texts.presetModel,
              view.models.map(one => ({ value: one.key, label: one.label })),
              view.draftPreset.model,
              model => view.setDraftPreset({ model }),
              presetAccent,
            )}
            {(view.models.find(one => one.key === view.draftPreset.model)?.hasEffort ?? false) &&
              menu(
                PRESET_EFFORT_KEY,
                texts.presetEffort,
                [{ value: '', label: texts.presetEffortDefault }, ...EFFORTS.map(level => ({ value: level, label: level }))],
                view.draftPreset.effort,
                effort => view.setDraftPreset({ effort }),
                presetAccent,
              )}
            <Button key={PRESET_ADD_KEY} hover={lit(PRESET_ADD_KEY, presetAccent)} plain hotkey={fixed('addPreset')} onPress={view.addPreset}>
              {`✓ ${texts.presetAdd}`}
            </Button>
          </Box>
        )}
      </Box>

      <Box key="head:session" flexDirection="row" gap={1} marginTop={1}>
        <Text bold color={SESSION_COLOR}>
          ◈ {texts.session}
        </Text>
        {pin('session', SESSION_COLOR)}
        {fill !== undefined && <Text dimColor>{fill.text} %</Text>}
      </Box>
      <Box key="frame:session" flexDirection="column" borderStyle="round" borderColor={SESSION_COLOR} paddingX={1}>
        {fill === undefined ? (
          <Text>
            {texts.context} <Text dimColor>—</Text>
          </Text>
        ) : Svg === undefined ? (
          <Text>
            {gaugeLabel(texts.context)}{' '}
            <Text color={usageColorOf(fill.value)}>{contextGaugeOf(fill.value).filled}</Text>
            <Text dimColor>{contextGaugeOf(fill.value).empty}</Text>
          </Text>
        ) : (
          // One continuous bar on the label's row, where the glyphs wrapped.
          <Box key="row:session:context" flexDirection="row" gap={1} alignItems="center">
            <Text>{texts.context}</Text>
            {gauge(fill.value / 100, 1, usageColorOf(fill.value), false, `${fill.text} %`, () => <Text />)}
          </Box>
        )}
        {limits.map(limit => {
          // Green to red as the window is spent.
          const color = usageColorOf(limit.percent)
          const tail = (
            <Text dimColor>
              {percentText(limit.percent)}
              {limit.resetsInMs === undefined ? '' : ` · ${texts.limitResets(durationText(limit.resetsInMs))}`}
            </Text>
          )

          return Svg === undefined ? (
            <Text key={`row:session:limit:${limit.kind}`}>
              {gaugeLabel(limitLabelOf(limit.kind))}{' '}
              <Text color={color}>{contextGaugeOf(limit.percent).filled}</Text>
              <Text dimColor>{contextGaugeOf(limit.percent).empty}</Text> {tail}
            </Text>
          ) : (
            <Box key={`row:session:limit:${limit.kind}`} flexDirection="row" gap={1} alignItems="center">
              <Text>{limitLabelOf(limit.kind)}</Text>
              {gauge(Math.min(limit.percent, 100) / 100, 1, color, false, percentText(limit.percent), () => <Text />)}
              {tail}
            </Box>
          )
        })}
        {view.usage !== undefined && (view.usage.usd !== undefined || view.usage.elapsedMs !== undefined) && (
          <Text key="row:session:spent">
            {view.usage.usd === undefined ? '' : (
              <Text>
                {texts.spent} <Text bold>{texts.usd(view.usage.usd)}</Text>
                {view.usage.elapsedMs === undefined ? '' : <Text dimColor> · </Text>}
              </Text>
            )}
            {view.usage.elapsedMs === undefined ? '' : (
              <Text>
                {texts.elapsed} <Text bold>{durationText(view.usage.elapsedMs)}</Text>
              </Text>
            )}
          </Text>
        )}
        {view.isCompactAsked ? (
          // A stray click would summarize the conversation for good: ask first.
          <Box key="row:session:compact" flexDirection="column">
            <Text color={SESSION_COLOR}>⚠ {texts.compactAsk}</Text>
            {Input !== undefined && (
              <Input
                key={COMPACT_NOTE_KEY}
                label={texts.compactNoteLabel}
                placeholder={texts.compactNoteHint}
                value={view.compactNote}
                submitLabel={texts.compactSubmit}
                onInput={(note: string) => view.setCompactNote(note)}
                onSubmit={(note: string) => {
                  view.setCompactNote(note)
                  view.compact()
                }}
              />
            )}
            <Box flexDirection="row" gap={2}>
              <Button key={COMPACT_CONFIRM_KEY} hover={lit(COMPACT_CONFIRM_KEY, SESSION_COLOR)} plain hotkey={fixed('compactYes')} onPress={view.compact}>
                {`✓ ${texts.compactYes}`}
              </Button>
              <Button
                key={COMPACT_CANCEL_KEY}
                hover={lit(COMPACT_CANCEL_KEY, DELETE_COLOR)}
                plain
                dimColor
                hotkey={fixed('compact')}
                onPress={() => view.askCompact(false)}
              >
                {`✕ ${texts.compactNo}`}
              </Button>
            </Box>
          </Box>
        ) : (
          <Button key={COMPACT_KEY} hover={lit(COMPACT_KEY, SESSION_COLOR)} plain hotkey={fixed('compact')} onPress={() => view.askCompact(true)}>
            {`⊟ compact`}
          </Button>
        )}
        {view.sessionName !== undefined && !view.isRenaming ? (
          // Named: the name, and a pencil that brings the field back; the
          // field gone, its focus and its "⏎ rename" go with it.
          <Box key="row:session:name" flexDirection="row" gap={1}>
            <Text>
              {texts.renameLabel}: <Text bold>{view.sessionName}</Text>
            </Text>
            {Input !== undefined && (
              <Button key={RENAME_EDIT_KEY} hover={lit(RENAME_EDIT_KEY, SESSION_COLOR)} plain dimColor hotkey={fixed('rename')} onPress={view.editName}>
                ✎
              </Button>
            )}
          </Box>
        ) : (
          Input !== undefined && (
            <Input
              key={RENAME_KEY}
              label={texts.renameLabel}
              placeholder={texts.renamePlaceholder}
              value={view.sessionName}
              submitLabel={texts.renameSubmit}
              onSubmit={(name: string) => view.renameSession(name)}
            />
          )
        )}
      </Box>

      <Box key="head:library" flexDirection="row" gap={1} marginTop={1}>
        <Text bold color={LIBRARY_FRAME_COLOR}>
          ▤ {texts.library}
        </Text>
      </Box>
      <Box key="frame:library" flexDirection="column" borderStyle="round" borderColor={LIBRARY_FRAME_COLOR} paddingX={1}>
        {LIBRARY_KINDS.map(kind => {
          const color = LIBRARY_COLORS[kind]
          const entries = view.library[kind]
          const isOpen = view.openKinds.includes(kind)

          return (
            <Box key={`section:${kind}`} flexDirection="column">
              <Box flexDirection="row" gap={1}>
                <Text bold color={color}>
                  {isOpen ? '▾' : '▸'}
                </Text>
                <Button
                  key={sectionKey(kind)} hover={lit(sectionKey(kind), color)}
                  plain
                  hotkey={view.isKeyboard ? LIBRARY_HOTKEYS[kind] : undefined}
                  onPress={() => view.toggleKind(kind)}
                >
                  {kindNames[kind]}
                </Button>
                <Text color={color}>{entries.length}</Text>
                {kind === 'plugins' && view.isReloadPending && (
                  <Button key={RELOAD_KEY} hover={lit(RELOAD_KEY, color)} plain hotkey={fixed('reload')} onPress={view.reloadPlugins}>
                    ↻ /reload-plugins
                  </Button>
                )}
              </Box>
              {isOpen && (
                <Box flexDirection="column">
                  {AGENT_SCOPES.map(scope => {
                    const isExpanded = view.expandedFrames.includes(`${kind}:${scope}`)
                    const { shown, hidden, count } = shownOf(entries, scope, isExpanded)

                    return (
                      <Box
                        key={`frame:${kind}:${scope}`}
                        flexDirection="column"
                        borderStyle="round"
                        borderColor={color}
                        borderDimColor
                        paddingX={1}
                      >
                        <Text color={color}>
                          {scopeNames[scope]} <Text dimColor>{count}</Text>
                        </Text>
                        {count === 0 && <Text dimColor>{texts.libraryNone}</Text>}
                        {shown.map(one => {
                          if (kind === 'hooks') {
                            return (
                              <Box key={`row:${entryKey(kind, one.name)}`} flexDirection="row" gap={1}>
                                <Text color={color}>{dotOf(true)}</Text>
                                <Text>
                                  {one.name} <Text dimColor>×{one.count}</Text>
                                </Text>
                              </Box>
                            )
                          }

                          const isCurrent = isToggleKind(kind) ? one.isOn !== false : one.name === view.current[kind]

                          return (
                            <Box key={`row:${entryKey(kind, one.name)}`} flexDirection="row" gap={1}>
                              <Text color={color}>{dotOf(isCurrent)}</Text>
                              <Button
                                key={entryKey(kind, one.name)} hover={lit(entryKey(kind, one.name), color)}
                                plain
                                dimColor={!isCurrent}
                                onPress={() => view.pickEntry(kind, one.name)}
                              >
                                {kind === 'commands' || kind === 'skills' ? `/${one.name}` : one.name}
                              </Button>
                            </Box>
                          )
                        })}
                        {(hidden > 0 || (isExpanded && count > ENTRIES_SHOWN)) && (
                          <Button
                            key={frameToggleKey(kind, scope)} hover={lit(frameToggleKey(kind, scope), color)}
                            plain
                            onPress={() => view.toggleFrame(kind, scope)}
                          >
                            {isExpanded ? `▴ ${texts.agentsLess}` : `▾ ${texts.agentsMore(hidden)}`}
                          </Button>
                        )}
                      </Box>
                    )
                  })}
                  <Text dimColor italic wrap="wrap">
                    {isToggleKind(kind) ? texts.toggleHint : kind === 'hooks' ? texts.hooksHint : texts.libraryHint}
                  </Text>
                </Box>
              )}
            </Box>
          )
        })}

        {section(CONFIG_KEY, CONFIG_COLOR, texts.config, view.configRows.length, (
          <Box flexDirection="column">
            {view.configRows.map(row => configControl(row))}
            <Text dimColor italic wrap="wrap">
              {texts.configHint}
            </Text>
          </Box>
        ), fixed('config'))}
      </Box>

      <Box key="compact-mode" marginTop={1}>
        <Button key={COMPACT_MODE_KEY} hover={lit(COMPACT_MODE_KEY, accent)} plain dimColor onPress={view.toggleCompact}>
          {`≡ ${texts.compactMode} ${view.isCompact ? texts.ultracodeOn : texts.ultracodeOff}`}
        </Button>
      </Box>

      <Box key="keyboard">
        <Button key={KEYBOARD_KEY} hover={lit(KEYBOARD_KEY, accent)} plain dimColor hotkey={fixed('keyboard')} onPress={view.toggleKeyboard}>
          {`⌨ ${texts.keyboard} ${view.isKeyboard ? texts.keyboardOn : texts.keyboardOff}`}
        </Button>
      </Box>

      {view.ignored.length > 0 && (
        <Box key="ignored" marginTop={1}>
          <Text color="#fb923c">
            {texts.ignored} {view.ignored.join(', ')}
          </Text>
        </Box>
      )}
    </Box>
  )
}

/** What the band above the prompt draws, and its `/compact` button's calls. */
export type BandView = Pick<PaneView, 'band' | 'models' | 'model' | 'effort' | 'context' | 'usage' | 'isCompactAsked' | 'askCompact' | 'compact'>

/**
 * Draws the band above the prompt: the values the pane's ↧ buttons put
 * there, in one row that wraps where the band is narrow.
 *
 * @param ui the surface's elements
 * @param view the values and the `/compact` button's calls
 * @param surface the surface drawing it, as `e.surface` names it
 * @returns the band's tree
 */
export function drawBand(ui: Elements, view: BandView, surface: RenderSurface = 'terminal'): RenderElement {
  const { Box, Button, Text } = ui
  const Svg = surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined
  const texts = say()
  const current = choiceOf(view.model, view.models)
  const fill =
    view.context?.percent === undefined ? undefined : contextPercentOf({ ...view.context, percent: view.context.percent })
  // A share drawn green to red: an SVG where the surface draws one.
  const bar = (key: string, label: string, percent: number, text: string): RenderElement => (
    <Box key={key} flexDirection="row" gap={1} alignItems="center">
      <Text>{label}</Text>
      {Svg === undefined ? (
        <Text>
          <Text color={usageColorOf(percent)}>{contextGaugeOf(percent, BAND_CELLS).filled}</Text>
          <Text dimColor>{contextGaugeOf(percent, BAND_CELLS).empty}</Text>
        </Text>
      ) : (
        <Svg source={gaugeSvgOf(Math.min(percent, 100) / 100, 1, usageColorOf(percent), false)} alt={text} />
      )}
      <Text dimColor>{text}</Text>
    </Box>
  )

  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
      {view.band.includes('model') && (
        <Text key="band:model" bold color={current?.color ?? NEUTRAL}>
          ◆ {current === undefined ? view.model ?? texts.unknown : labelOf(current, view.model, true)}
        </Text>
      )}
      {view.band.includes('effort') && (
        <Text key="band:effort" color={view.effort === undefined || current?.hasEffort === false ? NEUTRAL : EFFORT_COLORS[view.effort]}>
          ⚡ {current?.hasEffort === false ? texts.noEffortShort : view.effort ?? texts.unknown}
        </Text>
      )}
      {view.band.includes('session') && fill !== undefined && bar('band:context', texts.context, fill.value, `${fill.text} %`)}
      {view.band.includes('session') &&
        (view.usage?.limits ?? []).map(limit =>
          bar(`band:limit:${limit.kind}`, limitLabelOf(limit.kind), limit.percent, percentText(limit.percent)),
        )}
      {view.band.includes('session') && view.usage?.usd !== undefined && (
        <Text key="band:usd" bold>
          {texts.usd(view.usage.usd)}
        </Text>
      )}
      {view.band.includes('session') && view.usage?.elapsedMs !== undefined && (
        <Text key="band:elapsed" dimColor>
          {durationText(view.usage.elapsedMs)}
        </Text>
      )}
      {view.band.includes('session') &&
        (view.isCompactAsked ? (
          // As in the pane: a stray click would summarize the conversation for good.
          <Box key="band:compact" flexDirection="row" gap={1}>
            <Text color={SESSION_COLOR}>⚠ {texts.compactAsk}</Text>
            <Button key={BAND_COMPACT_CONFIRM_KEY} hover={lit(BAND_COMPACT_CONFIRM_KEY, SESSION_COLOR)} plain onPress={view.compact}>
              {`✓ ${texts.compactYes}`}
            </Button>
            <Button key={BAND_COMPACT_CANCEL_KEY} hover={lit(BAND_COMPACT_CANCEL_KEY, DELETE_COLOR)} plain dimColor onPress={() => view.askCompact(false)}>
              {`✕ ${texts.compactNo}`}
            </Button>
          </Box>
        ) : (
          <Button key={BAND_COMPACT_KEY} hover={lit(BAND_COMPACT_KEY, SESSION_COLOR)} plain onPress={() => view.askCompact(true)}>
            ⊟ compact
          </Button>
        ))}
    </Box>
  )
}

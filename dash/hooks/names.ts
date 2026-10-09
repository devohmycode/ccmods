/**
 * The names of the mod, gathered so a test reads the same ones. What the
 * person reads lives in `say/`, by language.
 */

/** The slash command, without its slash. */
export const COMMAND = 'dash'

/** The pane's id. */
export const PANE_ID = 'dash'

/** The key of a model's button. */
export const modelKey = (key: string): string => `model:${key}`

/** The key of an effort level's button. */
export const effortKey = (level: string): string => `effort:${level}`

/** The key of a preset's button. */
export const presetKey = (key: string): string => `preset:${key}`

/** The keys of the new preset's form: its opener, its fields and its button. */
export const NEW_PRESET_KEY = 'presets:new'
export const PRESET_NAME_KEY = 'presets:new:name'
export const PRESET_MODEL_KEY = 'presets:new:model'
export const PRESET_EFFORT_KEY = 'presets:new:effort'
export const PRESET_ADD_KEY = 'presets:new:add'

/** The key of the button that deletes a preset of the person's own. */
export const presetDeleteKey = (key: string): string => `presets:delete:${key}`

/** The key of the fast mode's button. */
export const FAST_KEY = 'fast'

/** The key of the ultracode button. */
export const ULTRACODE_KEY = 'ultracode'

/** The key of the drop-down of the models beside the rows. */
export const MORE_MODELS_KEY = 'model:more'

/** The key of one option of a drop-down. */
export const menuOptionKey = (menu: string, value: string): string => `${menu}:${value}`

/** The key of the field that renames the session. */
export const RENAME_KEY = 'session:rename'

/** The key of the button that brings the rename field back. */
export const RENAME_EDIT_KEY = 'session:rename:edit'

/** The key of the button that runs `/compact`. */
export const COMPACT_KEY = 'session:compact'

/** The key of the button that confirms `/compact`. */
export const COMPACT_CONFIRM_KEY = 'session:compact:confirm'

/** The key of the button that drops the `/compact` asked for. */
export const COMPACT_CANCEL_KEY = 'session:compact:cancel'

/** The key of the field that takes `/compact`'s instructions. */
export const COMPACT_NOTE_KEY = 'session:compact:note'

/** The key of the Settings section's header. */
export const CONFIG_KEY = 'config:open'

/** The key of one `/config` row's control. */
export const configKey = (key: string): string => `config:${key}`

/** The key of the button that shows or hides the hotkeys. */
export const KEYBOARD_KEY = 'keyboard'

/** The key of the button that folds the lists onto their current row. */
export const COMPACT_MODE_KEY = 'compact-mode'

/** The key of the button that puts a frame's values in the band, or takes them out. */
export const bandKey = (part: string): string => `band:${part}`

/** The keys of the band's `/compact` button, its confirmation and its cancel. */
export const BAND_COMPACT_KEY = 'band:compact'
export const BAND_COMPACT_CONFIRM_KEY = 'band:compact:confirm'
export const BAND_COMPACT_CANCEL_KEY = 'band:compact:cancel'

/** The key of the button that runs `/reload-plugins`. */
export const RELOAD_KEY = 'plugins:reload'

/** The key of a library section's header, which opens and closes it. */
export const sectionKey = (kind: string): string => `${kind}:open`

/** The key of an agent's, a command's or a skill's button. */
export const entryKey = (kind: string, name: string): string => `${kind}:item:${name}`

/** The key of a scope frame's Expand / Collapse button. */
export const frameToggleKey = (kind: string, scope: string): string => `${kind}:more:${scope}`

/**
 * The small, declarative contract a Skill uses to expose an interactive view.
 *
 * A Skill remains a normal `npx skills add` package.  The manifest is only a
 * capability declaration for dsh-skillui; it is not executable Skill logic.
 */

export type SkillUiStateMode = 'none' | 'session-projection' | 'workspace-json'

export type SkillUiStateConfig = {
  mode: SkillUiStateMode
  root?: string
  files?: Readonly<Record<string, string>>
  pollIntervalMs?: number
}

export type SkillUiResourceConfig = {
  root: string
  allow: readonly string[]
}

export type SkillUiManifest = {
  schemaVersion: 1
  skillId: string
  title: string
  entry: string
  state?: SkillUiStateConfig
  resources?: SkillUiResourceConfig
  commands?: readonly string[]
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
const COMMAND_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const MAX_PATH_LENGTH = 512

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown, maxLength = 256): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

/**
 * Normalize and validate a path that is relative to a declared root.
 * Backslashes are accepted in manifests so a Skill can be authored on
 * Windows, but traversal and absolute paths are rejected before filesystem
 * access.
 */
export function normalizeSafeRelativePath(value: unknown, options?: { allowGlob?: boolean }): string | undefined {
  if (!nonEmptyString(value, MAX_PATH_LENGTH)) return undefined

  const normalized = value.replaceAll('\\', '/')
  if (
    normalized.startsWith('/')
    || /^[a-zA-Z]:\//.test(normalized)
    || normalized.includes('\0')
  ) return undefined

  const segments = normalized.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) return undefined

  const allowGlob = options?.allowGlob === true
  for (const [index, segment] of segments.entries()) {
    if (segment === '**') {
      if (!allowGlob || index !== segments.length - 1) return undefined
      continue
    }
    if (segment.includes('*') || segment.includes('?')) return undefined
  }

  return segments.join('/')
}

function parseCommands(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return undefined

  const commands: string[] = []
  for (const command of value) {
    if (typeof command !== 'string' || !COMMAND_PATTERN.test(command)) return undefined
    if (!commands.includes(command)) commands.push(command)
  }
  return commands
}

function parseState(value: unknown): SkillUiStateConfig | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) return undefined

  const mode = value.mode
  if (mode !== 'none' && mode !== 'session-projection' && mode !== 'workspace-json') return undefined

  const result: SkillUiStateConfig = { mode }

  if (value.root !== undefined) {
    const root = normalizeSafeRelativePath(value.root)
    if (root === undefined) return undefined
    result.root = root
  }

  if (value.files !== undefined) {
    if (!isRecord(value.files)) return undefined
    const files: Record<string, string> = {}
    for (const [key, file] of Object.entries(value.files)) {
      if (!ID_PATTERN.test(key)) return undefined
      const normalized = normalizeSafeRelativePath(file)
      if (normalized === undefined) return undefined
      files[key] = normalized
    }
    result.files = files
  }

  if (value.pollIntervalMs !== undefined) {
    if (
      typeof value.pollIntervalMs !== 'number'
      || !Number.isFinite(value.pollIntervalMs)
      || value.pollIntervalMs < 250
      || value.pollIntervalMs > 60_000
    ) return undefined
    result.pollIntervalMs = Math.round(value.pollIntervalMs)
  }

  if (mode === 'workspace-json' && (result.root === undefined || result.files === undefined)) return undefined
  return result
}

function parseResources(value: unknown): SkillUiResourceConfig | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value) || !Array.isArray(value.allow)) return undefined

  const root = normalizeSafeRelativePath(value.root)
  if (root === undefined || value.allow.length === 0) return undefined

  const allow: string[] = []
  for (const pattern of value.allow) {
    const normalized = normalizeSafeRelativePath(pattern, { allowGlob: true })
    if (normalized === undefined) return undefined
    if (!allow.includes(normalized)) allow.push(normalized)
  }
  return { root, allow }
}

/** Parse untrusted JSON into the versioned Skill UI manifest contract. */
export function parseSkillUiManifest(value: unknown): SkillUiManifest | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1) return undefined
  if (typeof value.skillId !== 'string' || !ID_PATTERN.test(value.skillId)) return undefined
  if (!nonEmptyString(value.title, 120)) return undefined

  const entry = normalizeSafeRelativePath(value.entry)
  if (entry === undefined || !entry.startsWith('views/') || !entry.endsWith('.html')) return undefined

  const state = parseState(value.state)
  if (value.state !== undefined && state === undefined) return undefined
  const resources = parseResources(value.resources)
  if (value.resources !== undefined && resources === undefined) return undefined
  const commands = parseCommands(value.commands)
  if (value.commands !== undefined && commands === undefined) return undefined

  const manifest: SkillUiManifest = {
    schemaVersion: 1,
    skillId: value.skillId,
    title: value.title.trim(),
    entry,
  }
  if (state !== undefined) manifest.state = state
  if (resources !== undefined) manifest.resources = resources
  if (commands !== undefined) manifest.commands = commands
  return manifest
}

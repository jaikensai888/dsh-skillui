import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { delimiter, extname, join, relative, resolve } from 'node:path'
import { normalizeSafeRelativePath, parseSkillUiManifest, type SkillUiManifest } from '../shared/manifest.js'

export type SkillUiViewAsset = {
  body: string
  contentType: string
}

export type SkillUiDefinition = {
  manifest: SkillUiManifest
  skillRoot: string
  viewsRoot: string
  entryFile: string
  entryPath: string
}

function isWithin(parent: string, child: string): boolean {
  const distance = relative(parent, child)
  return distance === '' || (!distance.startsWith('..') && !distance.startsWith('/') && !/^[a-zA-Z]:/.test(distance))
}

function contentTypeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8'
    case '.css': return 'text/css; charset=utf-8'
    case '.js': return 'text/javascript; charset=utf-8'
    case '.json': return 'application/json; charset=utf-8'
    case '.svg': return 'image/svg+xml'
    default: return 'text/plain; charset=utf-8'
  }
}

async function existingPathInside(parent: string, candidate: string): Promise<string | undefined> {
  const resolvedParent = await realpath(parent).catch(() => undefined)
  if (resolvedParent === undefined) return undefined

  const absoluteCandidate = resolve(candidate)
  if (!isWithin(resolvedParent, absoluteCandidate)) return undefined
  const resolvedCandidate = await realpath(absoluteCandidate).catch(() => undefined)
  if (resolvedCandidate === undefined || !isWithin(resolvedParent, resolvedCandidate)) return undefined
  return resolvedCandidate
}

function decodeRelativePath(value: string): string | undefined {
  try {
    return normalizeSafeRelativePath(decodeURIComponent(value))
  } catch {
    return undefined
  }
}

/**
 * Discovers Skill UI declarations from normal installed Skill directories.
 * The registry never executes a file from a Skill package and only exposes
 * files below its declared `views` directory.
 */
export class SkillUiRegistry {
  private readonly roots: readonly string[]
  private definitions = new Map<string, SkillUiDefinition>()
  private pending: Promise<void> = Promise.resolve()

  constructor(roots: readonly string[]) {
    this.roots = [...new Set(roots.filter(root => root.trim() !== '').map(root => resolve(root)))]
  }

  refresh(): Promise<void> {
    const next = this.scan()
    this.pending = next.catch(() => undefined)
    return this.pending
  }

  async waitForReady(): Promise<void> {
    await this.pending
  }

  get(skillId: string): SkillUiDefinition | undefined {
    return this.definitions.get(skillId)
  }

  /**
   * Resolve a Skill definition, retrying discovery after a cache miss.
   *
   * Skill packages can be installed while DSH is already running. The first
   * startup scan may therefore legitimately miss a package; callers that
   * need a concrete Skill should get one chance to discover it lazily.
   */
  async resolve(skillId: string): Promise<SkillUiDefinition | undefined> {
    await this.waitForReady()
    let definition = this.get(skillId)
    if (definition === undefined) {
      await this.refresh()
      definition = this.get(skillId)
    }
    return definition
  }

  list(): readonly SkillUiDefinition[] {
    return [...this.definitions.values()]
  }

  async readView(skillId: string, relativePath: string): Promise<SkillUiViewAsset | undefined> {
    const definition = await this.resolve(skillId)
    if (definition === undefined) return undefined

    const safePath = decodeRelativePath(relativePath)
    if (safePath === undefined) return undefined
    const candidate = join(definition.viewsRoot, ...safePath.split('/'))
    const file = await existingPathInside(definition.viewsRoot, candidate)
    if (file === undefined) return undefined

    const information = await stat(file).catch(() => undefined)
    if (information === undefined || !information.isFile()) return undefined
    return {
      body: await readFile(file, 'utf8'),
      contentType: contentTypeFor(file),
    }
  }

  private async scan(): Promise<void> {
    const next = new Map<string, SkillUiDefinition>()

    for (const root of this.roots) {
      const resolvedRoot = await realpath(root).catch(() => undefined)
      if (resolvedRoot === undefined) continue

      const entries = await readdir(resolvedRoot, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const candidateRoot = join(resolvedRoot, entry.name)
        const skillRoot = await existingPathInside(resolvedRoot, candidateRoot)
        if (skillRoot === undefined) continue

        try {
          const raw = JSON.parse(await readFile(join(skillRoot, 'skillui', 'manifest.json'), 'utf8')) as unknown
          const manifest = parseSkillUiManifest(raw)
          if (manifest === undefined || manifest.skillId !== entry.name || next.has(manifest.skillId)) continue

          const viewsRoot = await existingPathInside(skillRoot, join(skillRoot, 'views'))
          if (viewsRoot === undefined) continue
          const entryFile = await existingPathInside(skillRoot, join(skillRoot, ...manifest.entry.split('/')))
          if (entryFile === undefined || !isWithin(viewsRoot, entryFile)) continue
          const information = await stat(entryFile)
          if (!information.isFile()) continue

          next.set(manifest.skillId, {
            manifest,
            skillRoot,
            viewsRoot,
            entryFile,
            entryPath: `/skillui/views/${encodeURIComponent(manifest.skillId)}/${manifest.entry.slice('views/'.length)}`,
          })
        } catch {
          // A malformed or partially installed Skill must not prevent other
          // installed Skills from loading.
        }
      }
    }

    this.definitions = next
  }
}

/** The default locations used by `npx skills add ... --all -g`. */
export function defaultSkillUiRoots(): readonly string[] {
  const configured = process.env.DSH_SKILLUI_ROOTS
    ?.split(delimiter)
    .map(root => root.trim())
    .filter(root => root !== '') ?? []
  const relativeRoots = ['.agents/skills', '.claude/skills', '.codex/skills', '.dsh/skills']
  const localRoots = relativeRoots.map(root => join(process.cwd(), root))
  const globalRoots = relativeRoots.map(root => join(homedir(), root))
  return [...new Set([...configured, ...localRoots, ...globalRoots])]
}

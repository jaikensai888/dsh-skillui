import { readFile, realpath, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import {
  DEMO_HTML_PATH,
  DEMO_SKILL_ID,
  isSkillUiCommandRequest,
  isSkillUiIdentity,
  type SkillUiIdentity,
} from '../shared/protocol.js'
import { normalizeSafeRelativePath } from '../shared/manifest.js'
import { DemoStore } from './demo-store.js'
import { SkillUiOpenRegistry } from './open-registry.js'
import { SkillUiRegistry, type SkillUiDefinition } from './skill-registry.js'

export const SKILL_UI_API_PATH = '/skillui/api'

export type SkillUiHttpRequest = {
  method: string
  pathname: string
  query: URLSearchParams
  body?: unknown
}

export type SkillUiHttpResponse = {
  status: number
  headers: Record<string, string>
  /** Text responses stay in `body` for callers and tests. */
  body: string
  /** Binary resource responses use this field so Buffer bytes are preserved. */
  binary?: Uint8Array
}

export type SkillUiRequestOptions = {
  registry?: SkillUiRegistry
  openRegistry?: SkillUiOpenRegistry
  resolveSessionCwd?: (sessionId: string) => string | undefined
}

const htmlHeaders = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
  'content-type': 'text/html; charset=utf-8',
  'x-content-type-options': 'nosniff',
}

const jsonHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
}

function jsonResponse(status: number, value: unknown): SkillUiHttpResponse {
  return {
    status,
    headers: jsonHeaders,
    body: JSON.stringify(value),
  }
}

function methodNotAllowed(allowed: string): SkillUiHttpResponse {
  return {
    ...jsonResponse(405, { error: 'method_not_allowed' }),
    headers: { ...jsonHeaders, allow: allowed },
  }
}

function identityFromQuery(query: URLSearchParams): SkillUiIdentity | undefined {
  const identity = {
    sessionId: query.get('sessionId') ?? '',
    skillId: query.get('skillId') ?? '',
    workflowId: query.get('workflowId') ?? '',
  }
  return isSkillUiIdentity(identity) ? identity : undefined
}

function decode(value: string): string | undefined {
  try {
    return decodeURIComponent(value)
  } catch {
    return undefined
  }
}

function isWithin(parent: string, child: string): boolean {
  const distance = relative(parent, child)
  return distance === '' || (
    distance !== '..'
    && !distance.startsWith(`..${sep}`)
    && !isAbsolute(distance)
  )
}

/** Resolve a path below an existing directory, including symlink checks. */
async function resolveWithin(
  parent: string,
  relativePath: string,
  allowMissing = false,
): Promise<string | undefined> {
  const resolvedParent = await realpath(parent).catch(() => undefined)
  if (resolvedParent === undefined) return undefined

  const candidate = resolve(resolvedParent, relativePath)
  if (!isWithin(resolvedParent, candidate)) return undefined

  const resolvedCandidate = await realpath(candidate).catch(() => undefined)
  if (resolvedCandidate !== undefined) {
    return isWithin(resolvedParent, resolvedCandidate) ? resolvedCandidate : undefined
  }
  if (!allowMissing) return undefined

  // A not-yet-created JSON file is valid, but every existing ancestor still
  // has to remain below the session workspace (including symlinked folders).
  let ancestor = dirname(candidate)
  while (isWithin(resolvedParent, ancestor)) {
    const resolvedAncestor = await realpath(ancestor).catch(() => undefined)
    if (resolvedAncestor !== undefined) {
      return isWithin(resolvedParent, resolvedAncestor) ? candidate : undefined
    }
    const next = dirname(ancestor)
    if (next === ancestor) break
    ancestor = next
  }
  return undefined
}

function contentTypeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8'
    case '.css': return 'text/css; charset=utf-8'
    case '.js': return 'text/javascript; charset=utf-8'
    case '.json': return 'application/json; charset=utf-8'
    case '.svg': return 'image/svg+xml'
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.webp': return 'image/webp'
    case '.gif': return 'image/gif'
    case '.pdf': return 'application/pdf'
    default: return 'application/octet-stream'
  }
}

function headersForContent(path: string): Record<string, string> {
  const contentType = contentTypeFor(path)
  if (contentType.startsWith('text/html')) return htmlHeaders
  return {
    'cache-control': 'no-store',
    'content-type': contentType,
    'x-content-type-options': 'nosniff',
  }
}

function viewParts(pathname: string): { skillId: string; relativePath: string } | undefined {
  const prefix = '/skillui/views/'
  if (!pathname.startsWith(prefix)) return undefined
  const remainder = pathname.slice(prefix.length)
  const separator = remainder.indexOf('/')
  if (separator <= 0 || separator === remainder.length - 1) return undefined
  const skillId = decode(remainder.slice(0, separator))
  if (skillId === undefined) return undefined
  return { skillId, relativePath: remainder.slice(separator + 1) }
}

function dataParts(pathname: string): { skillId: string; relativePath: string } | undefined {
  const prefix = `${SKILL_UI_API_PATH}/data/`
  if (!pathname.startsWith(prefix)) return undefined
  const remainder = pathname.slice(prefix.length)
  const separator = remainder.indexOf('/')
  if (separator <= 0 || separator === remainder.length - 1) return undefined
  const skillId = decode(remainder.slice(0, separator))
  if (skillId === undefined) return undefined
  return { skillId, relativePath: remainder.slice(separator + 1) }
}

function resourceParts(pathname: string): { skillId: string; relativePath: string } | undefined {
  const prefix = `${SKILL_UI_API_PATH}/resource/`
  if (!pathname.startsWith(prefix)) return undefined
  const remainder = pathname.slice(prefix.length)
  const separator = remainder.indexOf('/')
  if (separator <= 0 || separator === remainder.length - 1) return undefined
  const skillId = decode(remainder.slice(0, separator))
  if (skillId === undefined) return undefined
  return { skillId, relativePath: remainder.slice(separator + 1) }
}

function sessionCwd(options: SkillUiRequestOptions, sessionId: string): string | undefined {
  const candidate = options.resolveSessionCwd?.(sessionId) ?? process.cwd()
  return candidate.trim() === '' ? undefined : resolve(candidate)
}

function defaultDataValue(key: string): unknown {
  return /state|config|meta/i.test(key) ? {} : []
}

async function readWorkspaceJson(
  definition: SkillUiDefinition,
  identity: SkillUiIdentity,
  options: SkillUiRequestOptions,
  onlyKey?: string,
): Promise<{ data?: Record<string, unknown>; error?: SkillUiHttpResponse }> {
  const state = definition.manifest.state
  if (state?.mode !== 'workspace-json' || state.root === undefined || state.files === undefined) {
    return { data: {} }
  }

  const cwd = sessionCwd(options, identity.sessionId)
  if (cwd === undefined) return { error: jsonResponse(400, { error: 'session_cwd_unavailable' }) }

  const data: Record<string, unknown> = {}
  for (const [key, file] of Object.entries(state.files)) {
    if (onlyKey !== undefined && onlyKey !== key) continue
    const relativeFile = normalizeSafeRelativePath(`${state.root}/${file}`)
    if (relativeFile === undefined) return { error: jsonResponse(500, { error: 'invalid_skill_data_path' }) }
    const absoluteFile = await resolveWithin(cwd, relativeFile, true)
    if (absoluteFile === undefined) return { error: jsonResponse(403, { error: 'skill_data_path_denied' }) }

    try {
      data[key] = JSON.parse(await readFile(absoluteFile, 'utf8')) as unknown
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        data[key] = defaultDataValue(key)
        continue
      }
      if (error instanceof SyntaxError) {
        return { error: jsonResponse(500, { error: 'invalid_skill_data_json', key }) }
      }
      return { error: jsonResponse(500, { error: 'skill_data_unreadable', key }) }
    }
  }
  return { data }
}

function matchesResourcePattern(path: string, pattern: string): boolean {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3)
    return path === prefix || path.startsWith(`${prefix}/`)
  }
  return path === pattern
}

/** The original demo endpoint remains available for smoke testing the plugin. */
export function handleSkillUiRequest(
  request: SkillUiHttpRequest,
  store: DemoStore,
  demoHtml: string,
): SkillUiHttpResponse {
  if (request.pathname === DEMO_HTML_PATH) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET, HEAD')
    return {
      status: 200,
      headers: htmlHeaders,
      body: request.method === 'HEAD' ? '' : demoHtml,
    }
  }

  if (request.pathname === `${SKILL_UI_API_PATH}/state`) {
    if (request.method !== 'GET') return methodNotAllowed('GET')
    const identity = identityFromQuery(request.query)
    if (!identity || identity.skillId !== DEMO_SKILL_ID) {
      return jsonResponse(400, { error: 'invalid_identity' })
    }
    return jsonResponse(200, store.getState(identity))
  }

  if (request.pathname === `${SKILL_UI_API_PATH}/command`) {
    if (request.method !== 'POST') return methodNotAllowed('POST')
    if (!isSkillUiCommandRequest(request.body) || request.body.identity.skillId !== DEMO_SKILL_ID) {
      return jsonResponse(400, { error: 'invalid_command' })
    }
    return jsonResponse(200, store.dispatch(request.body.identity, request.body.command))
  }

  return jsonResponse(404, { error: 'not_found' })
}

async function handleGenericViewRequest(
  request: SkillUiHttpRequest,
  registry: SkillUiRegistry,
): Promise<SkillUiHttpResponse | undefined> {
  const parts = viewParts(request.pathname)
  if (parts === undefined) return undefined
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET, HEAD')

  const asset = await registry.readView(parts.skillId, parts.relativePath)
  if (asset === undefined) {
    // Keep the fixed demo route available while the generic registry only
    // contains externally installed Skills.
    return parts.skillId === DEMO_SKILL_ID ? undefined : jsonResponse(404, { error: 'view_not_found' })
  }
  return {
    status: 200,
    headers: headersForContent(parts.relativePath),
    body: request.method === 'HEAD' ? '' : asset.body,
  }
}

async function handleGenericStateRequest(
  request: SkillUiHttpRequest,
  options: SkillUiRequestOptions,
): Promise<SkillUiHttpResponse | undefined> {
  if (request.pathname !== `${SKILL_UI_API_PATH}/state`) return undefined
  if (request.method !== 'GET') return methodNotAllowed('GET')

  const identity = identityFromQuery(request.query)
  if (identity === undefined) return jsonResponse(400, { error: 'invalid_identity' })
  if (identity.skillId === DEMO_SKILL_ID) return undefined

  const registry = options.registry
  if (registry === undefined) return undefined
  await registry.waitForReady()
  const definition = registry.get(identity.skillId)
  if (definition === undefined) return jsonResponse(404, { error: 'skill_not_found' })

  const projection = await readWorkspaceJson(definition, identity, options)
  if (projection.error !== undefined) return projection.error
  return jsonResponse(200, {
    version: 1,
    identity,
    skill: {
      skillId: definition.manifest.skillId,
      title: definition.manifest.title,
      commands: definition.manifest.commands ?? [],
    },
    data: projection.data ?? {},
  })
}

async function handleGenericDataRequest(
  request: SkillUiHttpRequest,
  options: SkillUiRequestOptions,
): Promise<SkillUiHttpResponse | undefined> {
  const parts = dataParts(request.pathname)
  if (parts === undefined) return undefined
  if (request.method !== 'GET') return methodNotAllowed('GET')

  const identity = identityFromQuery(request.query)
  if (identity === undefined || identity.skillId !== parts.skillId) return jsonResponse(400, { error: 'invalid_identity' })
  const registry = options.registry
  if (registry === undefined) return jsonResponse(404, { error: 'skill_not_found' })
  await registry.waitForReady()
  const definition = registry.get(parts.skillId)
  const state = definition?.manifest.state
  if (definition === undefined || state?.mode !== 'workspace-json' || state.files === undefined) {
    return jsonResponse(404, { error: 'skill_data_not_found' })
  }

  const relativePath = decode(parts.relativePath)
  if (relativePath === undefined) return jsonResponse(404, { error: 'skill_data_not_found' })
  const normalizedPath = normalizeSafeRelativePath(relativePath)
  const key = Object.entries(state.files).find(([, file]) => file === normalizedPath)?.[0]
  if (key === undefined) return jsonResponse(404, { error: 'skill_data_not_declared' })

  const projection = await readWorkspaceJson(definition, identity, options, key)
  if (projection.error !== undefined) return projection.error
  return jsonResponse(200, projection.data?.[key] ?? defaultDataValue(key))
}

async function handleGenericResourceRequest(
  request: SkillUiHttpRequest,
  options: SkillUiRequestOptions,
): Promise<SkillUiHttpResponse | undefined> {
  const parts = resourceParts(request.pathname)
  if (parts === undefined) return undefined
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET, HEAD')

  const identity = identityFromQuery(request.query)
  if (identity === undefined || identity.skillId !== parts.skillId) return jsonResponse(400, { error: 'invalid_identity' })
  const registry = options.registry
  if (registry === undefined) return jsonResponse(404, { error: 'skill_not_found' })
  await registry.waitForReady()
  const definition = registry.get(parts.skillId)
  const resources = definition?.manifest.resources
  if (definition === undefined || resources === undefined) return jsonResponse(404, { error: 'skill_resource_not_found' })

  const relativePath = decode(parts.relativePath)
  const safePath = relativePath === undefined ? undefined : normalizeSafeRelativePath(relativePath)
  if (safePath === undefined || !resources.allow.some(pattern => matchesResourcePattern(safePath, pattern))) {
    return jsonResponse(404, { error: 'skill_resource_not_allowed' })
  }
  const resourcePath = normalizeSafeRelativePath(`${resources.root}/${safePath}`)
  if (resourcePath === undefined) return jsonResponse(403, { error: 'skill_resource_path_denied' })
  const cwd = sessionCwd(options, identity.sessionId)
  if (cwd === undefined) return jsonResponse(400, { error: 'session_cwd_unavailable' })
  const file = await resolveWithin(cwd, resourcePath)
  if (file === undefined) return jsonResponse(404, { error: 'skill_resource_not_found' })
  const information = await stat(file).catch(() => undefined)
  if (information === undefined || !information.isFile()) return jsonResponse(404, { error: 'skill_resource_not_found' })

  if (request.method === 'HEAD') {
    return { status: 200, headers: headersForContent(file), body: '' }
  }
  return {
    status: 200,
    headers: headersForContent(file),
    body: '',
    binary: await readFile(file),
  }
}

export async function handleSkillUiRequestAsync(
  request: SkillUiHttpRequest,
  store: DemoStore | undefined,
  demoHtml: string,
  options: SkillUiRequestOptions = {},
): Promise<SkillUiHttpResponse> {
  if (options.registry !== undefined) {
    const view = await handleGenericViewRequest(request, options.registry)
    if (view !== undefined) return view
  }

  if (request.pathname === `${SKILL_UI_API_PATH}/open`) {
    if (request.method !== 'GET') return methodNotAllowed('GET')
    const sessionId = request.query.get('sessionId') ?? ''
    if (sessionId.trim() === '') return jsonResponse(400, { error: 'invalid_session' })
    return jsonResponse(200, { requests: options.openRegistry?.take(sessionId) ?? [] })
  }

  if (request.pathname === `${SKILL_UI_API_PATH}/current`) {
    if (request.method !== 'GET') return methodNotAllowed('GET')
    const sessionId = request.query.get('sessionId') ?? ''
    if (sessionId.trim() === '') return jsonResponse(400, { error: 'invalid_session' })
    return jsonResponse(200, { request: options.openRegistry?.current(sessionId) ?? null })
  }

  const state = await handleGenericStateRequest(request, options)
  if (state !== undefined) return state
  const data = await handleGenericDataRequest(request, options)
  if (data !== undefined) return data
  const resource = await handleGenericResourceRequest(request, options)
  if (resource !== undefined) return resource

  return handleSkillUiRequest(request, store ?? new DemoStore(), demoHtml)
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 1024 * 1024) throw new Error('request_body_too_large')
    chunks.push(buffer)
  }

  if (chunks.length === 0) return undefined
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function writeResponse(response: ServerResponse, result: SkillUiHttpResponse): void {
  response.statusCode = result.status
  for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value)
  response.end(result.binary ?? result.body)
}

export function createNodeSkillUiHandler(
  store: DemoStore,
  loadDemoHtml: () => Promise<string>,
  options: SkillUiRequestOptions = {},
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  let htmlPromise: Promise<string> | undefined

  const getHtml = (): Promise<string> => {
    htmlPromise ??= loadDemoHtml()
    return htmlPromise
  }

  return async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://dsh-skillui.local')
      const body = request.method === 'POST' ? await readJsonBody(request) : undefined
      const result = await handleSkillUiRequestAsync(
        {
          method: request.method ?? 'GET',
          pathname: url.pathname,
          query: url.searchParams,
          ...(body === undefined ? {} : { body }),
        },
        store,
        await getHtml(),
        options,
      )
      writeResponse(response, result)
    } catch {
      writeResponse(response, jsonResponse(400, { error: 'invalid_request' }))
    }
  }
}

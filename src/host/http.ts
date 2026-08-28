import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  DEMO_HTML_PATH,
  DEMO_SKILL_ID,
  isSkillUiCommandRequest,
  isSkillUiIdentity,
  type SkillUiIdentity,
} from '../shared/protocol.js'
import { DemoStore } from './demo-store.js'

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
  body: string
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

function identityFromQuery(query: URLSearchParams): SkillUiIdentity | undefined {
  const identity = {
    sessionId: query.get('sessionId') ?? '',
    skillId: query.get('skillId') ?? '',
    workflowId: query.get('workflowId') ?? '',
  }
  return isSkillUiIdentity(identity) ? identity : undefined
}

function methodNotAllowed(allowed: string): SkillUiHttpResponse {
  return {
    ...jsonResponse(405, { error: 'method_not_allowed' }),
    headers: { ...jsonHeaders, allow: allowed },
  }
}

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
  response.end(result.body)
}

export function createNodeSkillUiHandler(
  store: DemoStore,
  loadDemoHtml: () => Promise<string>,
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
      const result = handleSkillUiRequest(
        {
          method: request.method ?? 'GET',
          pathname: url.pathname,
          query: url.searchParams,
          ...(body === undefined ? {} : { body }),
        },
        store,
        await getHtml(),
      )
      writeResponse(response, result)
    } catch {
      writeResponse(response, jsonResponse(400, { error: 'invalid_request' }))
    }
  }
}

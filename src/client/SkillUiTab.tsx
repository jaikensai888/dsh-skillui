import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { TabComponentProps } from 'dsh-better-sidebar/client/service'
import {
  buildSkillUiUrl,
  skillUiMetaFromTabMeta,
  skillUiMetaFromOpenRequest,
  resolveSkillUiCommands,
  resolveSkillUiEntryPath,
  resolveSkillUiIdentity,
  skillUiFrameMessage,
  type SkillUiTabMeta,
} from './contract.js'
import {
  isSkillUiCommandEnvelope,
  submitSkillUiCommand,
  type SkillUiSessionBindings,
} from './command-bridge.js'

const frameStyle: CSSProperties = {
  border: 0,
  display: 'block',
  height: '100%',
  width: '100%',
}

const containerStyle: CSSProperties = {
  height: '100%',
  minHeight: 0,
  width: '100%',
}

type SkillUiCommandResultMessage = {
  type: 'dsh-skillui:command-result'
  identity: ReturnType<typeof resolveSkillUiIdentity>
  requestId: string
  ok: boolean
  error?: string
}

export function SkillUiTab({ ctx, scope, tab, visible }: TabComponentProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const explicitMeta = useMemo(() => skillUiMetaFromTabMeta(tab.meta), [tab.meta])
  const [discovered, setDiscovered] = useState<{ sessionId: string; meta: SkillUiTabMeta }>()

  useEffect(() => {
    if (explicitMeta !== undefined) {
      setDiscovered(undefined)
      return
    }

    let cancelled = false
    setDiscovered(undefined)
    void fetch(`/skillui/api/current?sessionId=${encodeURIComponent(scope.sessionId)}`, {
      headers: { accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) return undefined
        return await response.json() as { request?: unknown }
      })
      .then((payload) => {
        if (cancelled) return
        const request = payload?.request
        if (
          typeof request !== 'object'
          || request === null
          || (request as { sessionId?: unknown }).sessionId !== scope.sessionId
        ) return
        const meta = skillUiMetaFromOpenRequest(request)
        if (meta !== undefined) setDiscovered({ sessionId: scope.sessionId, meta })
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [explicitMeta, scope.sessionId])

  const effectiveMeta = explicitMeta
    ?? (discovered?.sessionId === scope.sessionId ? discovered.meta : undefined)
  const identity = useMemo(
    () => resolveSkillUiIdentity(scope.sessionId, effectiveMeta),
    [effectiveMeta, scope.sessionId],
  )
  const commands = useMemo(() => resolveSkillUiCommands(effectiveMeta), [effectiveMeta])
  const entryPath = resolveSkillUiEntryPath(effectiveMeta)
  const src = buildSkillUiUrl(identity, entryPath)

  const sendVisibility = () => {
    iframeRef.current?.contentWindow?.postMessage(
      skillUiFrameMessage(identity, visible),
      window.location.origin,
    )
  }

  useEffect(() => {
    sendVisibility()
  }, [identity.sessionId, identity.skillId, identity.workflowId, visible])

  useEffect(() => {
    const frame = iframeRef.current
    if (frame === null) return

    const sendResult = (message: SkillUiCommandResultMessage) => {
      frame.contentWindow?.postMessage(message, window.location.origin)
    }

    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return
      if (!isSkillUiCommandEnvelope(event.data)) return
      const commandMessage = event.data
      if (
        commandMessage.identity.sessionId !== identity.sessionId
        || commandMessage.identity.skillId !== identity.skillId
        || commandMessage.identity.workflowId !== identity.workflowId
      ) return

      const command = commandMessage.command.type
      if (!commands.includes(command)) {
        sendResult({
          type: 'dsh-skillui:command-result',
          identity,
          requestId: commandMessage.command.requestId,
          ok: false,
          error: 'command_not_declared',
        })
        return
      }

      const sessions = (ctx as unknown as { sessions?: SkillUiSessionBindings }).sessions
      if (sessions === undefined) {
        sendResult({
          type: 'dsh-skillui:command-result',
          identity,
          requestId: commandMessage.command.requestId,
          ok: false,
          error: 'session_service_unavailable',
        })
        return
      }

      void submitSkillUiCommand(sessions, commandMessage).then((result) => {
        sendResult({
          type: 'dsh-skillui:command-result',
          identity,
          requestId: commandMessage.command.requestId,
          ...result,
        })
      })
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [commands, ctx, identity.sessionId, identity.skillId, identity.workflowId])

  return (
    <div data-skill-ui-tab="true" style={containerStyle}>
      <iframe
        ref={iframeRef}
        title={`${identity.skillId} Skill UI`}
        src={src}
        sandbox="allow-forms allow-same-origin allow-scripts"
        referrerPolicy="same-origin"
        style={frameStyle}
        onLoad={sendVisibility}
      />
    </div>
  )
}

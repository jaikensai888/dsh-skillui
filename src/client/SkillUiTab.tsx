import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { TabComponentProps } from 'dsh-better-sidebar/client/service'
import {
  buildSkillUiUrl,
  resolveSkillUiEntryPath,
  resolveSkillUiIdentity,
  skillUiFrameMessage,
} from './contract.js'

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

export function SkillUiTab({ scope, tab, visible }: TabComponentProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const identity = useMemo(
    () => resolveSkillUiIdentity(scope.sessionId, tab.meta),
    [scope.sessionId, tab.meta],
  )
  const entryPath = resolveSkillUiEntryPath(tab.meta)
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

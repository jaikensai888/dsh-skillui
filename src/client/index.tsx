import type { Context } from '@deepseek-ai/cordis'
import type {} from 'dsh-better-sidebar'
import type { TabDescriptor } from 'dsh-better-sidebar/client/service'
import { SKILL_UI_TAB_ID } from '../shared/protocol.js'
import { startSkillUiOpenPolling } from './activation.js'
import { SkillUiTab } from './SkillUiTab.js'
import { SkillUiIcon } from './SkillUiIcon.js'

export const inject = ['betterSidebar'] as const

export function createSkillUiTabDescriptor(): TabDescriptor {
  return {
    id: SKILL_UI_TAB_ID,
    title: 'Skill UI',
    icon: (size) => <SkillUiIcon size={size} />,
    order: 60,
    single: true,
    component: (props) => <SkillUiTab {...props} />,
  }
}

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const disposeTab = ctx.betterSidebar.registerTab(createSkillUiTabDescriptor())
    const disposePolling = startSkillUiOpenPolling(ctx.betterSidebar)
    return () => {
      disposePolling()
      disposeTab()
    }
  })
}

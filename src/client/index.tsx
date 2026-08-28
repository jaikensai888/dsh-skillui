import type { Context } from '@deepseek-ai/cordis'
import type {} from 'dsh-better-sidebar'
import type { TabDescriptor } from 'dsh-better-sidebar/client/service'
import { SKILL_UI_TAB_ID } from '../shared/protocol.js'
import { SkillUiTab } from './SkillUiTab.js'

export const inject = ['betterSidebar'] as const

export function createSkillUiTabDescriptor(): TabDescriptor {
  return {
    id: SKILL_UI_TAB_ID,
    title: 'Skill UI',
    order: 60,
    single: true,
    component: (props) => <SkillUiTab {...props} />,
  }
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.betterSidebar.registerTab(createSkillUiTabDescriptor()))
}

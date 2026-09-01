import { describe, expect, it } from 'vitest'
import { parseSkillUiManifest } from '../src/shared/manifest.js'

describe('Skill UI manifest contract', () => {
  it('accepts the recruitment workspace projection declaration', () => {
    expect(parseSkillUiManifest({
      schemaVersion: 1,
      skillId: 'recruitment',
      title: '招聘工作台',
      entry: 'views/index.html',
      state: {
        mode: 'workspace-json',
        root: '.dsh/data/recruitment',
        files: {
          positions: 'positions.json',
          candidates: 'candidates.json',
          passiveState: 'passive-state.json',
        },
      },
      resources: {
        root: '.dsh/data/recruitment',
        allow: ['resumes/**'],
      },
      commands: ['position.pause', 'candidate.markHandled'],
    })).toMatchObject({
      skillId: 'recruitment',
      entry: 'views/index.html',
      state: {
        mode: 'workspace-json',
        files: { passiveState: 'passive-state.json' },
      },
    })
  })

  it('rejects traversal and absolute paths before they reach the filesystem', () => {
    expect(parseSkillUiManifest({
      schemaVersion: 1,
      skillId: 'unsafe',
      title: 'Unsafe',
      entry: '../secrets.html',
    })).toBeUndefined()

    expect(parseSkillUiManifest({
      schemaVersion: 1,
      skillId: 'unsafe',
      title: 'Unsafe',
      entry: 'C:/secrets.html',
    })).toBeUndefined()
  })
})

import { textHash, type DurableGenerationRun } from '../repositories/generation-run-repository'
import type { EditorInlineInput, EditorInlineContext } from '../../src/shared/editor-inline-generation'
import type { WritingLanguage } from '../../src/shared/writing-language'
import { composePromptSystemRole, type PromptTemplate } from '../../src/services/builtin-prompt-templates'
import { renderPrompt } from '../../src/shared/render-prompt'
import type { GenerationTask } from '../../src/services/generation/generation-harness'
import { isDeepStrictEqual } from 'node:util'

const instructions = {
  skill: ['依据指定写作 Skill 修改选中段落，保留作者事实与情节结果。', 'Revise the selected passage using the chosen writing skill, preserving author facts and plot outcomes.'],
  refine: ['润色这部分，使语言自然、具体并增强场景表现力。', 'Refine this passage for natural, specific language and stronger scene craft.'],
  expand: ['扩写这部分，补充与情节有关的动作、感官和环境细节。', 'Expand this passage with plot-relevant action, sensory detail, and setting.'],
  continue: ['根据现有因果和人物动机，自然续写接下来的情节。', 'Continue naturally from the established causality and character motivation.'],
  dialogue: ['将这部分改写为有区分度、能推动冲突的自然对话。', 'Rewrite this passage as distinct, natural dialogue that advances the conflict.'],
} as const

export function validateEditorInlineInput(input: EditorInlineInput): EditorInlineInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['action', 'documentText', 'from', 'to', 'selectedText', 'skillId', 'instruction'].includes(key))
    || !Object.hasOwn(instructions, input.action) || typeof input.documentText !== 'string' || typeof input.selectedText !== 'string'
    || !Number.isSafeInteger(input.from) || !Number.isSafeInteger(input.to) || input.from < 0 || input.to <= input.from
    || input.to > input.documentText.length || input.documentText.slice(input.from, input.to) !== input.selectedText
    || Buffer.byteLength(input.documentText, 'utf8') > 8 * 1024 * 1024) throw new Error('GENERATION_EDITOR_INPUT_INVALID')
  if (input.action === 'skill' ? typeof input.skillId !== 'string' || !/^(builtin|user|project):[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.skillId) || typeof input.instruction !== 'string' || input.instruction.length > 8000 : input.skillId !== undefined || input.instruction !== undefined) throw new Error('GENERATION_EDITOR_INPUT_INVALID')
  return structuredClone(input)
}
export function buildEditorInlineContext(input: EditorInlineInput, writingLanguage: WritingLanguage, template: PromptTemplate): EditorInlineContext {
  const valid = validateEditorInlineInput(input)
  if (template.key !== 'edit_selected_text' || typeof template.content !== 'string') throw new Error('GENERATION_EDITOR_TEMPLATE_INVALID')
  return { ...valid, kind: 'author-draft', documentHash: textHash(valid.documentText), writingLanguage, template: structuredClone(template) }
}
export function readEditorInlineContext(run: DurableGenerationRun): EditorInlineContext {
  const context = run.binding.sourceManifest.editorInlineContext as EditorInlineContext | undefined
  if (run.binding.sourceManifest.operation !== 'editor-inline' || !context
    || textHash(JSON.stringify(context)) !== run.binding.sourceManifest.editorInlineContextHash
    || textHash(context.documentText) !== context.documentHash) throw new Error('GENERATION_EDITOR_CONTEXT_INVALID')
  const input = validateEditorInlineInput(run.binding.sourceManifest.editorInlineInput as EditorInlineInput)
  if (!isDeepStrictEqual(input, { action: context.action, documentText: context.documentText, from: context.from, to: context.to, selectedText: context.selectedText, ...(context.skillId !== undefined ? { skillId: context.skillId, instruction: context.instruction } : {}) })) throw new Error('GENERATION_EDITOR_CONTEXT_INVALID')
  return structuredClone(context)
}
export function readEditorInlineTask(run: DurableGenerationRun): GenerationTask {
  readEditorInlineContext(run)
  const task = run.binding.sourceManifest.editorInlineTask as GenerationTask | undefined
  if (!task || textHash(JSON.stringify(task)) !== run.binding.sourceManifest.editorInlineTaskHash) throw new Error('GENERATION_EDITOR_TASK_INVALID')
  return structuredClone(task)
}
export function editorInlineTask(context: EditorInlineContext): GenerationTask {
  const { template, writingLanguage } = context
  return { purpose: `editor-ai-${context.action}`, reasoningStage: ['refine', 'skill'].includes(context.action) ? 'review' : 'drafting', output: 'visible-text', messages: [
    { role: 'system', content: composePromptSystemRole(template, writingLanguage) },
    ...(context.skill ? [{ role: 'user' as const, content: `Supplemental writing guidance (${context.skill.name}); author facts, writing language and output format take priority:\n${context.skill.content}\n\nSurrounding manuscript (context only; replace only the selected passage):\n${context.documentText}` }] : []),
    { role: 'user', content: renderPrompt(template, { edit_instruction: instructions[context.action][writingLanguage === 'en-US' ? 1 : 0] + (context.instruction ? `\n${context.instruction}` : ''), selected_text: context.selectedText }, writingLanguage) },
  ] }
}

import { describe, expect, it } from 'vitest'
import { MAIN_GENERATION_POLICY, readMainGenerationPolicy } from '../main-generation-plan'

function storedPolicy() {
  const policy = structuredClone(MAIN_GENERATION_POLICY.taskBudgetPolicy)
  return {
    ...structuredClone(MAIN_GENERATION_POLICY), version: 's07-capacity-v2',
    budget: { maxPhysicalRequests: 32, maxTokenLiability: 67_108_864, maxOutputPerRequest: 32_768, maxActiveElapsedMs: 3_600_000 },
    taskBudgetPolicy: {
      ...policy,
      draftUnits: { ...policy.draftUnits, tokensPerUnit: { ...policy.draftUnits.tokensPerUnit, 'zh-TW': { numerator: 12, denominator: 5 } } },
      structuredItems: { ...policy.structuredItems, tokensPerItem: { ...policy.structuredItems.tokensPerItem,
        'zh-TW': { drafting: 3072, planning: 3072, review: 512, general: 512 } } },
    },
  }
}

describe('stored generation policy compatibility', () => {
  it('accepts the observed capacity policy without modifying the frozen policy or budget', () => {
    const policy = storedPolicy()
    const before = JSON.stringify(policy)
    expect(readMainGenerationPolicy(policy)).toBe(policy)
    expect(JSON.stringify(policy)).toBe(before)
    expect(readMainGenerationPolicy(MAIN_GENERATION_POLICY)).toBe(MAIN_GENERATION_POLICY)
  })

  it('continues accepting capacity policies without the locale aliases', () => {
    const policy = { ...MAIN_GENERATION_POLICY, version: 's07-capacity-v2' }
    expect(readMainGenerationPolicy(policy)).toBe(policy)
  })

  it.each(['sizing', 'items', 'english', 'estimator', 'unknown-locale', 'unknown-field', 'unknown-version'])(
    'rejects an additional unsupported change: %s', change => {
      const policy = storedPolicy()
      if (change === 'sizing') policy.taskBudgetPolicy.draftUnits.tokensPerUnit['zh-TW'].numerator = 99
      if (change === 'items') policy.taskBudgetPolicy.structuredItems.tokensPerItem['zh-TW'].planning = 99
      if (change === 'english') Object.assign(policy.taskBudgetPolicy.draftUnits.tokensPerUnit['en-US'], { numerator: 99 })
      if (change === 'estimator') Object.assign(policy, { estimatorVersion: 'unknown' })
      if (change === 'unknown-locale') Object.assign(policy.taskBudgetPolicy.draftUnits.tokensPerUnit, { 'ja-JP': { numerator: 12, denominator: 5 } })
      if (change === 'unknown-field') Object.assign(policy, { extra: true })
      if (change === 'unknown-version') policy.version = 'unknown'
      expect(() => readMainGenerationPolicy(policy)).toThrow('GENERATION_POLICY_UNSUPPORTED')
    },
  )

  it('still rejects invalid budgets for the compatible variant', () => {
    const policy = storedPolicy()
    policy.budget.maxPhysicalRequests = 0
    expect(() => readMainGenerationPolicy(policy)).toThrow('GENERATION_PLANNING_BUDGET_INVALID')
  })
})

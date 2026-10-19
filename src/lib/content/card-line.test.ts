import { describe, expect, it } from 'vitest'

import { cardLine } from './card-line'

describe('cardLine', () => {
  it('keeps the first clause before a dash', () => {
    expect(
      cardLine(
        'تسلّق بركانًا نشطًا قبل الفجر وشاهد شروق الشمس فوق بحيرة باتور — أكثر صباح أيقوني في بالي.',
      ),
    ).toBe('تسلّق بركانًا نشطًا قبل الفجر وشاهد شروق الشمس فوق بحيرة باتور')
    expect(
      cardLine('A hidden cove reached through a rock crevice — turquoise water and golden sand.'),
    ).toBe('A hidden cove reached through a rock crevice')
  })

  it('cuts a long single sentence at a word, with an ellipsis', () => {
    const line = cardLine(
      'مساج بالي لساعتين وحمّام الزهور وشاي الأعشاب في جناح مفتوح فوق الأدغال مع إطلالة على الوادي.',
    )
    expect(line.endsWith('…')).toBe(true)
    expect(line.length).toBeLessThanOrEqual(73)
    expect(line.startsWith('مساج بالي لساعتين')).toBe(true)
  })

  it('leaves short text alone (minus a final full stop)', () => {
    expect(cardLine('Warm water and a busy reef.')).toBe('Warm water and a busy reef')
    expect(cardLine('  Sunset   dinner ')).toBe('Sunset dinner')
  })

  it('skips a clause too short to say anything', () => {
    expect(
      cardLine('Ubud — a two-hour Balinese massage, flower bath and herbal tea above the jungle.'),
    ).toBe('Ubud — a two-hour Balinese massage')
  })
})

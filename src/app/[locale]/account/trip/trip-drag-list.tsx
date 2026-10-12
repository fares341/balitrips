'use client'

/**
 * سحب وإفلات لأماكن "رحلتي" (الوثيقة 12.2: "ترتيب الأماكن يدوياً").
 *
 * طبقة فوق أزرار ↑/↓ لا بديل عنها: الأسهم تبقى للوحة المفاتيح وقارئ الشاشة
 * والهاتف (سحب HTML5 لا يعمل باللمس). السحب داخل اليوم نفسه فقط — النقل بين
 * الأيام من قائمة اليوم في كل صف، كما في الأسهم.
 *
 * الترتيب يتغير فوراً على الشاشة، ثم يُحفظ على الخادم عند الإفلات. عند تحديث
 * البيانات من الخادم يُعاد تركيب المكوّن (`key` من الأب) بدل مزامنة الحالة.
 */

import { useState, useTransition, type DragEvent, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { reorderTripItems } from './planned-actions'

export interface TripDragItem {
  id: string
  day: number | null
  node: ReactNode
}

export function TripDragList({ items }: { items: TripDragItem[] }) {
  const t = useTranslations()
  const [order, setOrder] = useState(() => items.map((item) => item.id))
  const [dragging, setDragging] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()
  const byId = new Map(items.map((item) => [item.id, item]))

  const moveOver = (targetId: string) => {
    if (dragging === null || dragging === targetId) return
    if (byId.get(dragging)?.day !== byId.get(targetId)?.day) return
    setOrder((current) => {
      const next = current.filter((id) => id !== dragging)
      const at = next.indexOf(targetId)
      const from = current.indexOf(dragging)
      const to = current.indexOf(targetId)
      next.splice(from < to ? at + 1 : at, 0, dragging)
      return next
    })
  }

  const finish = () => {
    if (dragging === null) return
    setDragging(null)
    const initial = items.map((item) => item.id)
    if (order.join() === initial.join()) return
    startSaving(async () => {
      await reorderTripItems(order)
    })
  }

  const allow = (event: DragEvent<HTMLLIElement>, targetId: string) => {
    if (dragging !== null && byId.get(dragging)?.day === byId.get(targetId)?.day) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    }
  }

  return (
    <ol
      style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}
      aria-busy={saving}
    >
      {order.map((id, index) => {
        const item = byId.get(id)
        if (item === undefined) return null
        return (
          <li
            key={id}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', id)
              setDragging(id)
            }}
            onDragEnter={() => moveOver(id)}
            onDragOver={(event) => allow(event, id)}
            onDrop={(event) => {
              event.preventDefault()
              finish()
            }}
            onDragEnd={finish}
            className="row"
            style={{
              gap: 10,
              alignItems: 'center',
              flexWrap: 'wrap',
              borderBlockEnd: '1px solid var(--line, #eee)',
              paddingBlockEnd: 10,
              opacity: dragging === id ? 0.5 : 1,
              cursor: 'grab',
            }}
          >
            <span
              aria-hidden="true"
              title={t('acct_plan_drag')}
              className="muted"
              style={{ cursor: 'grab', userSelect: 'none', fontSize: 16, lineHeight: 1 }}
            >
              ⠿
            </span>
            <span className="muted" style={{ minWidth: 22, fontWeight: 700 }}>
              {index + 1}
            </span>
            {item.node}
          </li>
        )
      })}
    </ol>
  )
}

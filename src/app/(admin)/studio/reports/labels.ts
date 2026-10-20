import type { ExportLabels } from '@/lib/reports/export'

type T = (key: string) => string

export function exportLabels(t: T): ExportLabels {
  return {
    metric: t('rp.csv_metric'),
    value: t('rp.csv_value'),
    previous: t('rp.csv_previous'),
    change: t('rp.csv_change'),
    definition: t('rp.definitions_title'),
    period: t('rp.period'),
    comparedWith: t('rp.compared_with'),
    newLabel: t('rp.change_new'),
    points: t('rp.change_points'),
    hours: t('rp.hours_short'),
    generated: t('rp.generated'),
  }
}

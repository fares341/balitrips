/**
 * Phase 6: which adapter serves which connection type.
 *
 * Only `manual` and `csv` are implemented. Every other type resolves to a
 * placeholder with `implemented: false` and no methods, which Studio shows as
 * "requires per-supplier development" — nothing is called, nothing is faked.
 * Adding a real adapter: docs/integrations.md.
 */

import type { ConnectionType, SupplierAdapter } from './adapter'
import { csvAdapter } from './adapters/csv'
import { manualAdapter } from './adapters/manual'

const IMPLEMENTED: Partial<Record<ConnectionType, SupplierAdapter>> = {
  manual: manualAdapter,
  csv: csvAdapter,
}

export function adapterFor(type: ConnectionType): SupplierAdapter {
  return IMPLEMENTED[type] ?? { type, implemented: false }
}

export function isImplemented(type: ConnectionType): boolean {
  return IMPLEMENTED[type]?.implemented === true
}

/** Types a connection can be created with today, and the rest. */
export function implementedTypes(): ConnectionType[] {
  return Object.keys(IMPLEMENTED) as ConnectionType[]
}

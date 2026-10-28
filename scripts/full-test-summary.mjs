// Turns full-test-out/{cases.jsonl,report.json} into summary.json and copies
// failure screenshots into full-test-out/failures/ (see full-test.yml).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

const dir = process.argv[2] ?? 'full-test-out'
const cases = existsSync(`${dir}/cases.jsonl`)
  ? readFileSync(`${dir}/cases.jsonl`, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  : []

const tests = { passed: 0, failed: 0, flaky: 0, skipped: 0 }
const failedTests = []
mkdirSync(`${dir}/failures`, { recursive: true })
if (existsSync(`${dir}/report.json`)) {
  const report = JSON.parse(readFileSync(`${dir}/report.json`, 'utf8'))
  const walk = (suite) => {
    for (const child of suite.suites ?? []) walk(child)
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const status = t.status // expected | unexpected | flaky | skipped
        if (status === 'expected') tests.passed += 1
        else if (status === 'flaky') tests.flaky += 1
        else if (status === 'skipped') tests.skipped += 1
        else {
          tests.failed += 1
          const last = t.results?.[t.results.length - 1]
          failedTests.push({
            title: spec.title,
            file: spec.file,
            project: t.projectName,
            error: (last?.error?.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').slice(0, 1500),
          })
          for (const a of last?.attachments ?? []) {
            if (a.path && a.contentType === 'image/png' && existsSync(a.path)) {
              const name = `${t.projectName}-${spec.title}`
                .replace(/[^a-z0-9]+/gi, '_')
                .slice(0, 90)
              copyFileSync(a.path, `${dir}/failures/${name}-${basename(a.path)}`)
            }
          }
        }
      }
    }
  }
  for (const suite of report.suites ?? []) walk(suite)
}

const failedCases = cases.filter((c) => !c.ok)
const summary = {
  sha: process.env.GITHUB_SHA ?? '',
  forms: new Set(cases.map((c) => c.form.replace(/ form#\d+$/, ''))).size,
  formInstances: new Set(cases.map((c) => c.form)).size,
  cases: { total: cases.length, ok: cases.length - failedCases.length, failed: failedCases.length },
  tests,
  failedCases,
  failedTests,
}
writeFileSync(`${dir}/summary.json`, JSON.stringify(summary, null, 2))
console.log(
  `forms ${summary.forms} cases ${summary.cases.total} ok ${summary.cases.ok} failed ${summary.cases.failed}; tests ${JSON.stringify(tests)}`,
)

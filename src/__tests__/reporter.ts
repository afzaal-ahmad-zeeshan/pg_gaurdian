/**
 * pg_guardian — Custom Vitest 4 Markdown Reporter
 *
 * Uses the Vitest 4 Reporter API (onTestRunEnd + TestModule/TestCase).
 * Writes TEST_REPORT.md to the project root after every run.
 */
import type { Reporter, TestModule, TestCase } from 'vitest/reporters'
import { writeFileSync } from 'fs'
import { join } from 'path'

function categoryOf(moduleId: string): string {
  const rel = moduleId.replace(/\\/g, '/').split('__tests__/')[1] ?? moduleId
  if (rel.startsWith('api/')) return 'API Routes'
  if (rel.startsWith('components/')) return 'Components'
  if (rel.startsWith('flows/')) return 'User Flows'
  if (rel.includes('queries')) return 'DB Queries'
  if (rel.includes('servers-store')) return 'Server Store'
  if (rel.includes('context')) return 'Context'
  if (rel.includes('useServers')) return 'Hooks'
  if (rel.includes('lib.test')) return 'Pure Utilities'
  if (rel.includes('ServerSwitcher')) return 'Components'
  return 'Other'
}

function stateIcon(state: string): string {
  return state === 'passed' ? '✓' : state === 'failed' ? '✗' : '○'
}

export default class MarkdownReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>) {
    const lines: string[] = [
      '# pg_guardian — Test Report',
      '',
      `> Generated: ${new Date().toISOString()}`,
      '',
      '---',
      '',
    ]

    // Group modules by category
    const byCategory = new Map<string, TestModule[]>()
    for (const mod of testModules) {
      const cat = categoryOf(mod.moduleId)
      if (!byCategory.has(cat)) byCategory.set(cat, [])
      byCategory.get(cat)!.push(mod)
    }

    const ORDER = [
      'API Routes',
      'DB Queries',
      'Server Store',
      'Hooks',
      'Pure Utilities',
      'Components',
      'Context',
      'User Flows',
      'Other',
    ]

    let grandPass = 0, grandFail = 0, grandSkip = 0
    const allFailed: { path: string; name: string; error: string }[] = []

    for (const cat of ORDER) {
      const mods = byCategory.get(cat)
      if (!mods?.length) continue

      lines.push(`## ${cat}`)
      lines.push('')

      for (const mod of mods) {
        const rel = mod.moduleId.replace(/\\/g, '/').split('src/__tests__/')[1] ?? mod.moduleId

        let pass = 0, fail = 0, skip = 0
        const testLines: string[] = []

        for (const test of mod.children.allTests()) {
          const result = test.result()
          const state = result.state
          if (state === 'passed') pass++
          else if (state === 'failed') fail++
          else skip++

          const icon = stateIcon(state)
          // indent based on depth from module (count '>' in fullName)
          const depth = (test.fullName.split(' > ').length - 1)
          const indent = '  '.repeat(Math.max(0, depth - 1))
          testLines.push(`${indent}  - ${icon} ${test.name}`)

          if (state === 'failed') {
            const err = (result as any).errors?.[0]?.message?.split('\n')[0] ?? ''
            if (err) testLines.push(`${indent}    > \`${err}\``)
            allFailed.push({ path: rel, name: test.fullName, error: err })
          }
        }

        grandPass += pass; grandFail += fail; grandSkip += skip

        const icon = fail > 0 ? '❌' : '✅'
        lines.push(`### ${icon} \`${rel}\``)
        lines.push('')
        lines.push(`${pass} passed · ${fail} failed · ${skip} skipped`)
        lines.push('')

        // Print suite structure
        for (const suite of mod.children.suites()) {
          lines.push(`- **${suite.name}**`)
          for (const child of suite.children.array()) {
            if (child.type === 'test') {
              const tc = child as TestCase
              lines.push(`  - ${stateIcon(tc.result().state)} ${tc.name}`)
            } else {
              lines.push(`  - **${child.name}**`)
              for (const grandchild of child.children.array()) {
                if (grandchild.type === 'test') {
                  const tc2 = grandchild as TestCase
                  lines.push(`    - ${stateIcon(tc2.result().state)} ${tc2.name}`)
                }
              }
            }
          }
        }
        // Top-level tests (not in a suite)
        for (const tc of mod.children.tests()) {
          lines.push(`- ${stateIcon(tc.result().state)} ${tc.name}`)
        }
        lines.push('')
      }
    }

    // ── Summary ──────────────────────────────────────────────────────────
    lines.push('---')
    lines.push('')
    lines.push('## Summary')
    lines.push('')
    lines.push('| Category | Files | Passed | Failed | Skipped |')
    lines.push('|----------|------:|-------:|-------:|--------:|')

    for (const cat of ORDER) {
      const mods = byCategory.get(cat)
      if (!mods?.length) continue
      let p = 0, f = 0, s = 0
      for (const mod of mods) {
        for (const t of mod.children.allTests()) {
          const st = t.result().state
          if (st === 'passed') p++
          else if (st === 'failed') f++
          else s++
        }
      }
      const icon = f > 0 ? '❌' : '✅'
      lines.push(`| ${icon} ${cat} | ${mods.length} | ${p} | ${f} | ${s} |`)
    }

    lines.push(`| **Total** | **${testModules.length}** | **${grandPass}** | **${grandFail}** | **${grandSkip}** |`)
    lines.push('')

    if (allFailed.length > 0) {
      lines.push('### ❌ Failed Tests')
      lines.push('')
      for (const f of allFailed) {
        lines.push(`- \`${f.path}\` — **${f.name}**`)
        if (f.error) lines.push(`  > \`${f.error}\``)
      }
      lines.push('')
    }

    const outPath = join(process.cwd(), 'TEST_REPORT.md')
    writeFileSync(outPath, lines.join('\n'))
    console.log(`\n📋  Test report → ${outPath}`)
  }
}

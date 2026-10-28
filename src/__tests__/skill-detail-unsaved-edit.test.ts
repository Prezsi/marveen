/**
 * The skill detail modal's inline editor (web/app.js). Cancel only hid the editor and kept the typed
 * text in it, and the close button closed the modal without a word, so an edit was dropped silently
 * (reported 2026-10-28). Now an edit that differs from the last loaded or saved content is unsaved:
 * Cancel and the close button ask first (confirmDialog, danger), a confirmed Cancel puts the saved
 * content back, and an unchanged editor closes without a question.
 *
 * The SHIPPED helpers run against a fake editor with confirmDialog injected; the wiring is pinned as
 * short source fragments (house idiom).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

const APP = readFileSync(new URL('../../web/app.js', import.meta.url), 'utf-8')
const HU = readFileSync(new URL('../../web/lang/hu.js', import.meta.url), 'utf-8')
const EN = readFileSync(new URL('../../web/lang/en.js', import.meta.url), 'utf-8')

const helpersStart = APP.indexOf('let _skillDetailSavedContent')
const HELPERS = APP.slice(helpersStart, APP.indexOf('function _skillDetailExitEdit(', helpersStart))

function load(answer: boolean) {
  const editor = { hidden: true, value: '' }
  const confirmDialog = vi.fn(async () => answer)
  const document = { getElementById: (id: string) => (id === 'skillDetailEditor' ? editor : null) }
  const api = new Function('document', 'confirmDialog', 't', `${HELPERS}
    return { setSaved: (v) => { _skillDetailSavedContent = v }, has: _skillDetailHasUnsavedEdit, discard: _skillDetailConfirmDiscard }`,
  )(document, confirmDialog, (k: string) => k) as {
    setSaved: (v: string) => void; has: () => boolean; discard: () => Promise<boolean>
  }
  return { editor, confirmDialog, ...api }
}

describe('skill detail: an unsaved edit is not dropped silently', () => {
  it('the helpers are found', () => {
    expect(helpersStart).toBeGreaterThan(-1)
    expect(HELPERS).toContain('function _skillDetailHasUnsavedEdit(')
    expect(HELPERS).toContain('async function _skillDetailConfirmDiscard(')
  })

  it('not editing, or editing without a change: nothing is unsaved, no question', async () => {
    const d = load(false)
    d.setSaved('# Skill')
    d.editor.value = 'changed but not in edit mode'
    expect(d.has()).toBe(false)
    d.editor.hidden = false
    d.editor.value = '# Skill'
    expect(d.has()).toBe(false)
    await expect(d.discard()).resolves.toBe(true)
    expect(d.confirmDialog).not.toHaveBeenCalled()
  })

  it.each([[true], [false]])('a changed edit asks in a danger dialog, and its answer (%s) decides', async (answer) => {
    const d = load(answer)
    d.setSaved('# Skill')
    d.editor.hidden = false
    d.editor.value = '# Skill\nmore'
    expect(d.has()).toBe(true)
    await expect(d.discard()).resolves.toBe(answer)
    expect(d.confirmDialog).toHaveBeenCalledTimes(1)
    expect(d.confirmDialog).toHaveBeenCalledWith({
      title: 'skills.confirm.discard_edit_title',
      message: 'skills.confirm.discard_edit',
      okLabel: 'skills.confirm.discard_edit_ok',
      danger: true,
    })
  })

  it('Cancel asks first, and a confirmed Cancel puts the saved content back before leaving edit mode', () => {
    const i = APP.indexOf("cancelBtn.addEventListener('click', async () => {")
    expect(i).toBeGreaterThan(-1)
    const body = APP.slice(i, APP.indexOf('_skillDetailExitEdit()', i) + 1)
    const ask = body.indexOf('if (!(await _skillDetailConfirmDiscard())) return')
    const reset = body.indexOf('editor.value = _skillDetailSavedContent')
    expect(ask).toBeGreaterThan(-1)
    expect(reset).toBeGreaterThan(ask)
  })

  it('the close button asks before it closes', () => {
    const i = APP.indexOf("document.getElementById('skillDetailClose').addEventListener('click', async () => {")
    expect(i).toBeGreaterThan(-1)
    const body = APP.slice(i, APP.indexOf('closeModal(skillDetailOverlay)', i))
    expect(body).toContain('if (!(await _skillDetailConfirmDiscard())) return')
  })

  it('the saved content follows the loaded and the saved text', () => {
    expect(APP).toMatch(/if \(editor\) editor\.value = rawContent\s*\n\s*_skillDetailSavedContent = rawContent/)
    expect(APP).toMatch(/_skillDetailSavedContent = newContent\s*\n\s*_skillDetailExitEdit\(\)/)
  })

  it.each(['skills.confirm.discard_edit_title', 'skills.confirm.discard_edit', 'skills.confirm.discard_edit_ok'])(
    '%s is in both languages',
    (key) => {
      expect(HU).toContain(`'${key}':`)
      expect(EN).toContain(`'${key}':`)
    },
  )
})

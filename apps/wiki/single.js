import common from '../../../../lib/common/common.js'

const MATERIAL_CONSUMPTION_RE = /(突破材料|精英化材料|升阶材料|进阶材料|需求素材|需求材料|材料消耗|素材消耗|消耗材料|素材需求|材料需求|突破消耗|精英化消耗|材料\s*\|\s*(?:数量|个数|需求|消耗)|素材\s*\|\s*(?:数量|个数|需求|消耗))/
const MATERIAL_SECTION_RE = /(^突破$|^精英化$|突破.*材料|精英化.*材料|升阶.*材料|进阶.*材料|材料消耗|素材消耗|消耗材料)/
const WEAPON_SKIP_SECTION_RE = /(推荐装备干员|推荐干员|推荐搭配干员)/
const WEAPON_BASIC_INFO_RE = /(基础信息|基本信息)/
const WEAPON_SKILL_RE = /(武器技能|技能|机制)/
const MATRIX_RE = /基质/

export function buildWikiHeader(ctx, data, typeLabel) {
  let header = `【${typeLabel}】${data?.name || '未知'}\n`
  if (Array.isArray(data?.caption) && data.caption.length > 0) {
    const cap = ctx.renderCaption(data.caption)
    if (cap) header += cap + '\n'
  }
  return header.trim()
}

function createSectionResultByDocMap(ctx, data, typeLabel) {
  const content = data?.content
  const docMap = content?.document_map || content?.documentMap || {}
  const header = buildWikiHeader(ctx, data, typeLabel)
  if (!docMap || typeof docMap !== 'object') return { content, docMap: null, header }
  return { content, docMap, header }
}

export function parseOperatorSections(ctx, data, typeLabel) {
  const { content, docMap, header } = createSectionResultByDocMap(ctx, data, typeLabel)
  if (!docMap) {
    return { header: `${header}\n暂无正文`, sections: [] }
  }

  const sections = []
  const opSections = ctx.buildOperatorSections(content)
  for (const sec of opSections) {
    if (isMaterialConsumptionTitle(sec?.title || '')) continue
    const contentText = sanitizeSectionContent(sec.lines.join('\n').replace(/\n{3,}/g, '\n\n'))
    if (!contentText) continue
    sections.push({ chapterTitle: `【${sec.title}】`, content: contentText })
  }
  return { header, sections }
}

function normalizeLines(lines = []) {
  if (!Array.isArray(lines)) return []
  const out = []
  let prevEmpty = true
  for (const raw of lines) {
    const line = String(raw || '').trimEnd()
    if (!line.trim()) {
      if (!prevEmpty) out.push('')
      prevEmpty = true
      continue
    }
    out.push(line)
    prevEmpty = false
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out
}

function isMaterialConsumptionTitle(title = '') {
  const t = String(title || '').trim()
  if (!t) return false
  return MATERIAL_CONSUMPTION_RE.test(t) || MATERIAL_SECTION_RE.test(t)
}

function filterSpecialLines(lines = [], options = {}) {
  const removeMaterial = options.removeMaterial !== false
  const removeMatrix = options.removeMatrix === true
  return normalizeLines(lines).filter((line) => {
    if (removeMaterial && MATERIAL_CONSUMPTION_RE.test(line)) return false
    if (removeMatrix && MATRIX_RE.test(line)) return false
    return true
  })
}

function sanitizeSectionContent(content = '', options = {}) {
  const lines = String(content || '').split('\n')
  return normalizeLines(filterSpecialLines(lines, options)).join('\n').trim()
}

function buildGenericDocChunk(ctx, content, docId, title = '') {
  const parts = ctx.renderDocumentParts(content, docId, { includeDataTables: true })
  const textLines = filterSpecialLines(parts.textLines)
  const tableLines = filterSpecialLines(parts.tableLines)
  const lines = []
  const chunkTitle = String(title || '').trim()
  if (isMaterialConsumptionTitle(chunkTitle)) return null

  if (chunkTitle) lines.push(`【${chunkTitle}】`)
  if (textLines.length > 0) lines.push(...textLines)
  if (tableLines.length > 0) {
    if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('')
    lines.push(...tableLines)
  }

  const normalized = normalizeLines(lines)
  if (normalized.length === 0) return null
  return {
    title: chunkTitle,
    lines: normalized
  }
}

function collectChapterDocChunks(ctx, content, chapter, docMap, excludedDocIds) {
  const { widgetMap } = ctx.getContentMaps(content)
  const widgets = Array.isArray(chapter?.widgets) ? chapter.widgets : []
  const chunks = []
  const seenDocIds = new Set()

  const pushDocChunk = (docId, title = '') => {
    if (!docId || seenDocIds.has(docId)) return
    if (!docMap[docId] || excludedDocIds.has(docId)) return
    seenDocIds.add(docId)
    const chunk = buildGenericDocChunk(ctx, content, docId, title)
    if (chunk) chunks.push(chunk)
  }

  for (const widget of widgets) {
    const widgetData = widgetMap[widget?.id]
    if (!widgetData) continue
    const tabs = ctx.getTabEntries(widgetData)
    if (tabs.length === 0) continue
    for (const tab of tabs) {
      const tabTitle = String(tab?.title || '').trim() || String(widget?.title || '').trim()
      pushDocChunk(tab?.docId, tabTitle)
    }
  }

  if (chunks.length > 0) return chunks

  const docIds = ctx.getDocumentIdsByChapter(content, chapter)
  for (const docId of docIds) pushDocChunk(docId, '')
  return chunks
}

function mergeSectionContent(base = '', extra = '') {
  const left = String(base || '').trim()
  const right = String(extra || '').trim()
  if (!left) return right
  if (!right) return left
  if (left === right || left.includes(right)) return left
  if (right.includes(left)) return right
  return `${left}\n\n${right}`
}

function mergeSectionsByTitle(sections = []) {
  const out = []
  const titleIndexMap = new Map()
  for (const section of sections) {
    const title = String(section?.chapterTitle || '').trim() || '【章节】'
    const content = String(section?.content || '').trim()
    if (!content) continue

    const index = titleIndexMap.get(title)
    if (typeof index === 'number') {
      out[index].content = mergeSectionContent(out[index].content, content)
      continue
    }

    titleIndexMap.set(title, out.length)
    out.push({
      chapterTitle: title,
      content
    })
  }
  return out
}

function tryParseKeyValueLine(line = '') {
  const text = String(line || '').trim()
  if (!text || /^[-:|]+$/.test(text)) return null

  if (text.includes('|')) {
    const cells = text.split('|').map((s) => s.trim())
    if (cells.length >= 2 && cells[0] && cells[1]) {
      return [cells[0], cells.slice(1).join(' / ')]
    }
  }

  const match = text.match(/^【?([^【】:：|]{1,30})】?\s*[：:]\s*(.+)$/)
  if (match) return [match[1].trim(), match[2].trim()]
  return null
}

function buildKeyValueTableContent(lines = [], leftHeader = '属性', rightHeader = '数值') {
  const pairs = []
  const seen = new Set()
  for (const line of normalizeLines(lines)) {
    const kv = tryParseKeyValueLine(line)
    if (!kv) continue
    const [key, value] = kv
    if (!key || !value) continue
    const dedupKey = `${key}=>${value}`
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)
    pairs.push([key, value])
  }
  if (pairs.length === 0) return ''
  return [`${leftHeader} | ${rightHeader}`, ...pairs.map(([k, v]) => `${k} | ${v}`)].join('\n')
}

function buildWeaponSkillTableContent(chunks = [], chapterTitle = '') {
  const rows = []
  const usedNames = new Set()

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const chunkLines = filterSpecialLines(chunk?.lines || [], { removeMatrix: true })
    if (chunkLines.length === 0) continue

    const declaredTitle = String(chunk?.title || '').trim()
    if (declaredTitle && MATRIX_RE.test(declaredTitle)) continue

    const skillNameBase = declaredTitle || (String(chapterTitle).includes('机制') ? `机制${i + 1}` : `技能${i + 1}`)
    const skillName = skillNameBase.trim() || `技能${i + 1}`
    if (!skillName || MATRIX_RE.test(skillName)) continue

    const detailParts = []
    for (const raw of chunkLines) {
      const line = String(raw || '').trim()
      if (!line) continue
      if (line === `【${declaredTitle}】`) continue
      const kv = tryParseKeyValueLine(line)
      if (kv) {
        detailParts.push(`${kv[0]}：${kv[1]}`)
      } else if (!/^【.+】$/.test(line)) {
        detailParts.push(line)
      }
    }

    const summary = normalizeLines(detailParts).join('；').trim()
    if (!summary) continue

    const uniqueName = usedNames.has(skillName) ? `${skillName}-${rows.length + 1}` : skillName
    usedNames.add(uniqueName)
    rows.push([uniqueName, summary])
  }

  if (rows.length === 0) return ''
  const tableTitle = String(chapterTitle).includes('机制') ? '机制 | 说明' : '技能 | 说明'
  return [tableTitle, ...rows.map(([n, d]) => `${n} | ${d}`)].join('\n')
}

function shouldSkipWeaponSectionTitle(title = '') {
  const t = String(title || '').trim()
  if (!t) return true
  if (t === '特别提醒') return true
  if (WEAPON_SKIP_SECTION_RE.test(t)) return true
  if (isMaterialConsumptionTitle(t)) return true
  if (MATRIX_RE.test(t)) return true
  return false
}

function buildChapterContentFromChunks(chunks = []) {
  const lines = []
  for (const chunk of chunks) {
    if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('')
    lines.push(...(chunk?.lines || []))
  }
  return sanitizeSectionContent(lines.join('\n'))
}

export function parseGenericSections(ctx, data, typeLabel) {
  const { content, docMap, header } = createSectionResultByDocMap(ctx, data, typeLabel)
  if (!docMap) return { header: `${header}\n暂无正文`, sections: [] }

  const excludedDocIds = new Set()
  const { chapterGroup } = ctx.getContentMaps(content)
  const excludeTitles = new Set(['特别提醒'])
  const sections = []

  for (const ch of chapterGroup) {
    const title = ch?.title || ''
    if (excludeTitles.has(title)) continue
    if (isMaterialConsumptionTitle(title)) continue

    const chunks = collectChapterDocChunks(ctx, content, ch, docMap, excludedDocIds)
    if (chunks.length === 0) continue

    const chapterContent = buildChapterContentFromChunks(chunks)
    if (!chapterContent) continue
    sections.push({
      chapterTitle: `【${title}】`,
      content: chapterContent
    })
  }

  return {
    header,
    sections: mergeSectionsByTitle(sections)
  }
}

export function parseWeaponSections(ctx, data, typeLabel) {
  const { content, docMap, header } = createSectionResultByDocMap(ctx, data, typeLabel)
  if (!docMap) return { header: `${header}\n暂无正文`, sections: [] }

  const excludedDocIds = new Set()
  const { chapterGroup } = ctx.getContentMaps(content)
  const sections = []

  for (const ch of chapterGroup) {
    const title = String(ch?.title || '').trim()
    if (shouldSkipWeaponSectionTitle(title)) continue

    const chunks = collectChapterDocChunks(ctx, content, ch, docMap, excludedDocIds)
    if (chunks.length === 0) continue

    let chapterContent = ''
    if (WEAPON_BASIC_INFO_RE.test(title)) {
      const allLines = []
      for (const chunk of chunks) allLines.push(...(chunk?.lines || []))
      chapterContent = buildKeyValueTableContent(filterSpecialLines(allLines), '属性', '数值')
      if (!chapterContent) chapterContent = sanitizeSectionContent(allLines.join('\n'))
    } else if (WEAPON_SKILL_RE.test(title)) {
      chapterContent = buildWeaponSkillTableContent(chunks, title)
      if (!chapterContent) chapterContent = sanitizeSectionContent(buildChapterContentFromChunks(chunks), { removeMatrix: true })
    } else {
      chapterContent = buildChapterContentFromChunks(chunks)
    }

    chapterContent = sanitizeSectionContent(chapterContent, { removeMatrix: WEAPON_SKILL_RE.test(title) })
    if (!chapterContent) continue
    sections.push({
      chapterTitle: `【${title}】`,
      content: chapterContent
    })
  }

  return {
    header,
    sections: mergeSectionsByTitle(sections)
  }
}

function getSectionTitle(section, index) {
  const raw = String(section?.chapterTitle || '').trim()
  if (raw) return raw
  return `【章节${index + 1}】`
}

function buildDescriptionTitle(typeLabel, titleOverride) {
  if (typeof titleOverride === 'string' && titleOverride.trim()) return titleOverride.trim()
  return `【${String(typeLabel || '').trim() || '条目'}描述】`
}

function buildDescriptionContent(ctx, data, sectionResult) {
  const header = String(sectionResult?.header || '').trim()
  if (header) return sanitizeSectionContent(header) || '暂无描述'
  const caption = String(ctx.renderCaption(Array.isArray(data?.caption) ? data.caption : []) || '').trim()
  return sanitizeSectionContent(caption) || '暂无描述'
}

export async function renderSubtypeAsSingleImage(ctx, payload, mode = 'generic') {
  const { data, typeLabel, subTypeId } = payload || {}
  const parser = mode === 'operator'
    ? parseOperatorSections
    : mode === 'weapon'
      ? parseWeaponSections
      : parseGenericSections
  const sectionResult = parser(ctx, data, typeLabel)

  const sections = Array.isArray(sectionResult?.sections) ? sectionResult.sections : []
  const imgSegment = await ctx.renderWikiImage(data, typeLabel, sections, subTypeId)
  if (!imgSegment) return false

  await ctx.reply(imgSegment)
  return true
}

export async function renderSubtypeAsSplitImages(ctx, payload, mode = 'generic', options = {}) {
  const { data, typeLabel, subTypeId } = payload || {}
  const parser = mode === 'operator'
    ? parseOperatorSections
    : mode === 'weapon'
      ? parseWeaponSections
      : parseGenericSections
  const sectionResult = parser(ctx, data, typeLabel)
  const sections = Array.isArray(sectionResult?.sections) ? sectionResult.sections : []

  const itemName = data?.name || '未知'
  const subtitle = `${typeLabel} · ${itemName}`
  const descriptionTitle = buildDescriptionTitle(typeLabel, options.descriptionTitle)
  const descriptionContent = buildDescriptionContent(ctx, data, sectionResult)
  const descriptionSection = { chapterTitle: descriptionTitle, content: descriptionContent }

  const forwardNodes = []
  const descImgSegment = await ctx.renderWikiImage(data, typeLabel, [descriptionSection], subTypeId, {
    hideCaption: true,
    showItemName: true,
    showTypeLabel: true,
    subtitle
  })
  if (descImgSegment) {
    forwardNodes.push([descriptionTitle, descImgSegment])
  }

  const sectionRenderOptions = {
    hideCaption: true,
    hideCover: true,
    showItemName: false,
    showTypeLabel: false,
    subtitle
  }
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const imgSegment = await ctx.renderWikiImage(data, typeLabel, [section], subTypeId, sectionRenderOptions)
    if (!imgSegment) {
      logger.warn(`[终末地Wiki] 分段渲染失败，跳过章节: ${section?.chapterTitle || i + 1}`)
      continue
    }
    forwardNodes.push([getSectionTitle(section, i), imgSegment])
  }

  if (forwardNodes.length > 1) {
    const forwardTitle = `${typeLabel}Wiki · ${itemName}`
    const forwardMsg = common.makeForwardMsg(ctx.e, forwardNodes, forwardTitle)
    if (!forwardMsg) return false
    await ctx.e.reply(forwardMsg)
    return true
  }

  if (forwardNodes.length === 1) {
    await ctx.reply(forwardNodes[0][1])
    return true
  }

  const overviewImg = await ctx.renderWikiImage(data, typeLabel, sections, subTypeId)
  if (!overviewImg) return false

  await ctx.reply(overviewImg)
  return true
}

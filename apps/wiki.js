// 官方 wiki 数据不全，后续可再补

import { getMessage } from '../utils/common.js'
import EndfieldRequest from '../model/endfieldReq.js'
import setting from '../utils/setting.js'
import { getCopyright } from '../utils/copyright.js'
import { getWikiSubtypeRenderer } from './wiki/registry.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Wiki 游戏百科：main_type_id=1，子分类按原始 SUB_LABEL（1~9） */
const WIKI = {
  MAIN_TYPE_GAME: '1',
  SUB_LABEL: {
    '1': '干员',
    '2': '武器',
    '3': '威胁',
    '4': '装备',
    '5': '设备',
    '6': '物品',
    '7': '武器基质',
    '8': '任务',
    '9': '活动'
  },
  DEFAULT_SUB_TYPE_ID: '1'
}
WIKI.SUB_LABEL_BY_ID = { ...WIKI.SUB_LABEL }
WIKI.TEMPLATE_BY_SUB_TYPE = {
  '1': 'wiki/operator',
  '2': 'wiki/weapon',
  '4': 'wiki/equipment',
  '5': 'wiki/tactical-item',
  '3': 'wiki/placeholder',
  '6': 'wiki/placeholder',
  '7': 'wiki/placeholder',
  '8': 'wiki/placeholder',
  '9': 'wiki/placeholder'
}
WIKI.SUB_TYPE_BY_LABEL = {
  干员: '1',
  角色: '1',
  武器: '2',
  威胁: '3',
  装备: '4',
  设备: '5',
  战术物品: '5',
  战术道具: '5',
  物品: '5',
  武器基质: '7',
  任务: '8',
  活动: '9'
}
WIKI.LABELS_SORTED = Object.entries(WIKI.SUB_TYPE_BY_LABEL).sort((a, b) => b[0].length - a[0].length)

const WIKI_RES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../resources/wiki')

export class EndfieldWiki extends plugin {
  constructor() {
    super({
      name: '[endfield-plugin]Wiki查询',
      dsc: '终末地Wiki数据查询（:wiki xxx / :wikixxx）',
      event: 'message',
      priority: 50,
      rule: [
        {
          reg: '^(?:[:：]|[/#](?:zmd|终末地))wiki\\s*(.+)$',
          fnc: 'queryWiki'
        }
      ]
    })
    this._wikiTemplateCache = new Map()
  }

  /**
   * 解析 :wiki [干员|武器|...] xxx，返回 { subTypeId, name }。
   * 无前缀时默认 subTypeId='1'（干员）；按标签长度降序匹配，避免短标签抢匹配。
   */
  getWikiQuery() {
    const msg = (this.e.msg || '').trim()
    const afterPrefix = msg.replace(/^(?:[:：]|[/#](?:zmd|终末地))\s*/i, '').replace(/^wiki\s*/i, '').trim()
    if (!afterPrefix) return { subTypeId: WIKI.DEFAULT_SUB_TYPE_ID, name: '' }
    for (const [label, subTypeId] of WIKI.LABELS_SORTED) {
      if (afterPrefix === label || afterPrefix.startsWith(label + ' ') || afterPrefix.startsWith(label)) {
        const name = afterPrefix === label ? '' : afterPrefix.slice(label.length).trim()
        return { subTypeId, name }
      }
    }
    return { subTypeId: WIKI.DEFAULT_SUB_TYPE_ID, name: afterPrefix }
  }

  getWikiTemplateBySubTypeId(subTypeId) {
    const id = String(subTypeId || '')
    return WIKI.TEMPLATE_BY_SUB_TYPE[id] || WIKI.TEMPLATE_BY_SUB_TYPE[WIKI.DEFAULT_SUB_TYPE_ID]
  }

  getRenderableWikiTemplate(subTypeId) {
    const id = String(subTypeId || '')
    const cached = this._wikiTemplateCache.get(id)
    if (cached) return cached

    const preferred = this.getWikiTemplateBySubTypeId(id)
    const preferredName = String(preferred || '').split('/').pop() || 'wiki'
    const preferredFile = path.join(WIKI_RES_DIR, `${preferredName}.html`)
    if (fs.existsSync(preferredFile)) {
      this._wikiTemplateCache.set(id, preferred)
      return preferred
    }

    const placeholderFile = path.join(WIKI_RES_DIR, 'placeholder.html')
    if (fs.existsSync(placeholderFile)) {
      logger.warn(`[终末地Wiki] 模板缺失: ${preferredFile}，回退到 wiki/placeholder`)
      this._wikiTemplateCache.set(id, 'wiki/placeholder')
      return 'wiki/placeholder'
    }

    logger.warn(`[终末地Wiki] 模板缺失: ${preferredFile}，回退到 wiki/wiki`)
    this._wikiTemplateCache.set(id, 'wiki/wiki')
    return 'wiki/wiki'
  }

  /** 在条目列表中按名称精确匹配，再模糊匹配（包含关系），无结果时返回首项 */
  findByName(items, name) {
    if (!Array.isArray(items) || !name) return null
    const n = String(name).trim()
    const exact = items.find((item) => (item.name || '') === n)
    if (exact) return exact
    const fuzzy = items.find((item) => {
      const itemName = item.name || ''
      return itemName && (itemName.includes(n) || n.includes(itemName))
    })
    return fuzzy || items[0] || null
  }

  /** 统一 Wiki 查询：:wiki [干员|武器] xxx / :wiki xxx（默认干员），GET /api/wiki/items?main_type_id=1&sub_type_id={sub_type_id} 后取详情 */
  async queryWiki() {
    const { subTypeId, name } = this.getWikiQuery()
    const typeLabel = WIKI.SUB_LABEL_BY_ID[subTypeId] || WIKI.SUB_LABEL_BY_ID[WIKI.DEFAULT_SUB_TYPE_ID]
    if (!name) {
      await this.reply(getMessage('wiki.provide_content'))
      return true
    }

    const commonConfig = setting.getConfig('common') || {}
    if (!commonConfig.api_key || String(commonConfig.api_key).trim() === '') {
      await this.reply(getMessage('common.need_api_key'))
      return true
    }

    const req = new EndfieldRequest(0, '', '')
    const listRes = await req.getWikiData('wiki_items', {
      main_type_id: WIKI.MAIN_TYPE_GAME,
      sub_type_id: subTypeId,
      page: 1,
      page_size: 100
    })

    if (!listRes || listRes.code !== 0) {
      logger.error(`[终末地Wiki] ${typeLabel}列表失败: ${JSON.stringify(listRes)}`)
      await this.reply(getMessage('wiki.query_failed', { name }))
      return true
    }

    const items = listRes.data?.items || []
    const item = this.findByName(items, name)
    if (!item) {
      await this.reply(getMessage('wiki.not_found', { name, type_label: typeLabel }))
      return true
    }

    const detailRes = await req.getWikiData('wiki_item_detail', { id: item.item_id })
    if (!detailRes || detailRes.code !== 0 || !detailRes.data) {
      await this.reply(getMessage('wiki.detail_failed', { name: item.name || item.item_id }))
      return true
    }

    const data = detailRes.data
    const dataSubTypeId = String(data.sub_type_id ?? data.subTypeId ?? '')
    const finalSubTypeId = dataSubTypeId || subTypeId
    const dataTypeLabel = WIKI.SUB_LABEL_BY_ID[finalSubTypeId] || typeLabel
    if (!this.e?.runtime?.render) {
      await this.reply(getMessage('wiki.render_failed'))
      return true
    }

    const renderSubtype = getWikiSubtypeRenderer(finalSubTypeId)
    try {
      const rendered = await renderSubtype(this, {
        data,
        typeLabel: dataTypeLabel,
        subTypeId: finalSubTypeId
      })
      if (rendered) {
        return true
      }
      logger.error('[终末地Wiki] 图片渲染失败: 渲染器返回空结果')
    } catch (err) {
      logger.error(`[终末地Wiki] 图片渲染失败: ${err?.message || err}`)
    }
    await this.reply(getMessage('wiki.render_failed'))
    return true
  }

  /**
   * 全局去重 + 连续空行合并：相同内容只保留首次出现，减少大量重复（如多处「基础数据」「技能数据」表头）。
   * 不硬编码文案，适用于任意 API 返回内容。
   */
  dedupLines(text) {
    if (!text || typeof text !== 'string') return text
    const lines = text.split('\n')
    const out = []
    const seen = new Set()
    let prevEmpty = false
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed === '') {
        if (!prevEmpty) out.push('')
        prevEmpty = true
        continue
      }
      prevEmpty = false
      if (seen.has(trimmed)) continue
      seen.add(trimmed)
      out.push(line)
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  /** 是否像小节标题（短、无冒号），用于在之前插入分隔线以分段 */
  looksLikeSectionTitle(s) {
    if (!s || typeof s !== 'string') return false
    const t = s.trim()
    return t.length > 0 && t.length <= 16 && !t.includes('：') && !t.includes(':')
  }

  /** 是否为纯数据表格（详细属性/RANK/技能专精/材料消耗/激活条件等），这类表格跳过不输出，避免刷屏 */
  isDataOnlyTable(cells) {
    if (!Array.isArray(cells) || cells.length < 6) return false
    const text = cells.join(' ')
    const dataMarkers = ['详细属性', 'RANK ', '技能专精', '材料消耗', '激活条件', '基础数据', '需求素材', '能力值', '详细数值']
    const matchCount = dataMarkers.filter((m) => text.includes(m)).length
    return matchCount >= 2
  }

  renderCaption(caption) {
    if (!Array.isArray(caption)) return ''
    return caption
      .map((c) => {
        if (c?.kind !== 'text') return ''
        if (typeof c.text === 'string') return c.text
        return c.text?.text || ''
      })
      .filter(Boolean)
      .join(' ')
  }

  /** 渲染时不展示的章节标题（与 extract-all-text 一致） */
  /** 渲染时不展示的章节（干员档案/特别提醒/武器档案等） */
  static EXCLUDED_CHAPTER_TITLES = ['干员档案', '特别提醒', '档案']

  /** 干员资料仅保留：代号、性别、身份认证、生日、种族 */
  static GANYUAN_ZILIAO_KEYS = /^【(代号|性别|身份认证|生日|种族)】/

  /** 统一取 content 的 chapter_group / widget_common_map，避免各处重复写 snake_case 与 camelCase */
  getContentMaps(content) {
    return {
      chapterGroup: content?.chapter_group || content?.chapterGroup || [],
      widgetMap: content?.widget_common_map || content?.widgetCommonMap || {}
    }
  }

  /** 从单个章节的 widgets 中收集 document id 列表（供 getDocumentIdsByChapter / getExcludedDocumentIds 复用） */
  getDocIdsFromChapter(chapter, widgetMap) {
    const docIds = []
    const widgets = chapter?.widgets || []
    for (const w of widgets) {
      const wid = w?.id
      if (!wid) continue
      const widgetData = widgetMap[wid]
      if (!widgetData) continue
      const tabDataMap = widgetData.tab_data_map || widgetData.tabDataMap || {}
      for (const key of Object.keys(tabDataMap)) {
        const c = tabDataMap[key]?.content
        if (c) docIds.push(c)
      }
    }
    return docIds
  }

  /** 干员资料章节无 tab_data_map 时，取干员档案→档案(oAggkMLV)→基础档案对应文档 */
  getFallbackDocIdsForGanyuanZiliao(content) {
    const { chapterGroup, widgetMap } = this.getContentMaps(content)
    const archiveChapter = chapterGroup.find((ch) => (ch?.title || '') === '干员档案')
    if (!archiveChapter) return []
    const widgetData = widgetMap['oAggkMLV'] || {}
    if (!widgetData) return []
    const tabDataMap = widgetData.tab_data_map || widgetData.tabDataMap || {}
    const tabList = widgetData.tab_list || widgetData.tabList || []
    const firstTabId = tabList[0]?.tab_id || Object.keys(tabDataMap)[0]
    const docId = firstTabId ? tabDataMap[firstTabId]?.content : null
    return docId ? [docId] : []
  }

  /** 渲染单个文档，可选仅保留干员资料五项（代号/性别/身份认证/生日/种族） */
  renderDocument(content, docId, opts = {}) {
    const docMap = content?.document_map || content?.documentMap || {}
    const doc = docMap[docId]
    if (!doc) return []
    const blockIds = doc.block_ids || doc.blockIds || []
    const blockMap = doc.block_map || doc.blockMap || {}
    const ganyuanZiliaoOnly = opts.ganyuanZiliaoOnly === true
    const lines = []
    for (const bid of blockIds) {
      const block = blockMap[bid]
      if (!block) continue
      const line = this.renderBlock(block, blockMap, opts)
      if (!line) continue
      if (ganyuanZiliaoOnly && !EndfieldWiki.GANYUAN_ZILIAO_KEYS.test(line.trim())) continue
      lines.push(line)
    }
    return lines
  }

  /**
   * 根据 content 结构收集需排除的文档 ID（上述章节下 widgets 对应的 document）。
   */
  getExcludedDocumentIds(content) {
    const excluded = new Set()
    const { chapterGroup, widgetMap } = this.getContentMaps(content)
    const excludeTitles = new Set(EndfieldWiki.EXCLUDED_CHAPTER_TITLES)
    for (const ch of chapterGroup) {
      if (!excludeTitles.has(ch?.title || '')) continue
      for (const docId of this.getDocIdsFromChapter(ch, widgetMap)) excluded.add(docId)
    }
    return excluded
  }

  /** 按 chapter_group 顺序收集某章节下的文档 ID */
  getDocumentIdsByChapter(content, chapter) {
    const { widgetMap } = this.getContentMaps(content)
    return this.getDocIdsFromChapter(chapter, widgetMap)
  }

  /** 粗略判断是否为干员百科内容（用于旧文本分段逻辑兼容） */
  isOperatorContent(content) {
    const { chapterGroup } = this.getContentMaps(content)
    return chapterGroup.some((ch) => {
      const title = ch?.title || ''
      return title === '能力扩延' || title === '干员潜能'
    })
  }

  /** 将 content 按章节渲染为纯文本；干员资料无文档时用基础档案并只保留代号/性别/身份认证/生日/种族；排除特别提醒/干员档案 */
  renderWikiContent(content) {
    const docMap = content?.document_map || content?.documentMap || {}
    if (!docMap || typeof docMap !== 'object') return ''
    if (this.isOperatorContent(content)) {
      const sections = this.buildOperatorSections(content)
      const lines = []
      for (const sec of sections) {
        if (lines.length > 0) {
          lines.push('────────────')
          lines.push('')
        }
        lines.push(`【${sec.title}】`)
        lines.push('')
        lines.push(sec.lines.join('\n'))
      }
      return lines.join('\n').replace(/\n{3,}/g, '\n\n')
    }
    const excludedDocIds = this.getExcludedDocumentIds(content)
    const { chapterGroup } = this.getContentMaps(content)
    const excludeTitles = new Set(EndfieldWiki.EXCLUDED_CHAPTER_TITLES)

    const lines = []
    for (const ch of chapterGroup) {
      const title = ch?.title || ''
      if (excludeTitles.has(title)) continue
      const rawDocIds = this.getDocumentIdsByChapter(content, ch)
      let docIds = rawDocIds.filter((id) => docMap[id] && !excludedDocIds.has(id))
      if (docIds.length === 0 && title === '干员资料') docIds = this.getFallbackDocIdsForGanyuanZiliao(content)
      if (docIds.length === 0) continue

      if (lines.length > 0) {
        lines.push('────────────')
        lines.push('')
      }
      lines.push('【' + title + '】')
      lines.push('')

      const isGanyuanZiliaoFallback = title === '干员资料' && rawDocIds.length === 0
      const opts = isGanyuanZiliaoFallback ? { ganyuanZiliaoOnly: true } : {}
      for (const docId of docIds) {
        for (const line of this.renderDocument(content, docId, opts)) {
          if (this.looksLikeSectionTitle(line) && lines.length > 0) lines.push('')
          lines.push(line)
        }
      }
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n')
  }

  /**
   * 按章节返回内容，用于合并转发按【干员资料】等标题分段。
   * 返回 { header, sections }，header=【干员】name+caption，sections=[{ chapterTitle, content }]。
   */
  getWikiSections(data, typeLabel) {
    const content = data?.content
    const docMap = content?.document_map || content?.documentMap || {}
    if (!docMap || typeof docMap !== 'object') {
      return { header: `【${typeLabel}】${data?.name || '未知'}\n暂无正文`, sections: [] }
    }
    const excludedDocIds = this.getExcludedDocumentIds(content)
    const { chapterGroup } = this.getContentMaps(content)
    const excludeTitles = new Set(EndfieldWiki.EXCLUDED_CHAPTER_TITLES)

    let header = `【${typeLabel}】${data?.name || '未知'}\n`
    if (Array.isArray(data.caption) && data.caption.length > 0) {
      const cap = this.renderCaption(data.caption)
      if (cap) header += cap + '\n'
    }
    header = header.trim()

    const sections = []
    if (this.isOperatorContent(content)) {
      const opSections = this.buildOperatorSections(content)
      for (const sec of opSections) {
        const contentText = sec.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
        sections.push({ chapterTitle: `【${sec.title}】`, content: contentText })
      }
      return { header, sections }
    }
    for (const ch of chapterGroup) {
      const title = ch?.title || ''
      if (excludeTitles.has(title)) continue
      const rawDocIds = this.getDocumentIdsByChapter(content, ch)
      let docIds = rawDocIds.filter((id) => docMap[id] && !excludedDocIds.has(id))
      if (docIds.length === 0 && title === '干员资料') docIds = this.getFallbackDocIdsForGanyuanZiliao(content)
      if (docIds.length === 0) continue

      const isGanyuanZiliaoFallback = title === '干员资料' && rawDocIds.length === 0
      const opts = isGanyuanZiliaoFallback ? { ganyuanZiliaoOnly: true } : {}
      const lines = []
      for (const docId of docIds) {
        for (const line of this.renderDocument(content, docId, opts)) {
          if (this.looksLikeSectionTitle(line) && lines.length > 0) lines.push('')
          lines.push(line)
        }
      }
      const chapterContent = this.dedupLines(lines.join('\n').replace(/\n{3,}/g, '\n\n')).trim()
      sections.push({ chapterTitle: '【' + title + '】', content: chapterContent })
    }
    return { header, sections }
  }

  normalizeWikiSectionContent(text) {
    return String(text || '')
      .replace(/(?:^|\n)─{6,}(?=\n|$)/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  parseWikiTableRow(line) {
    if (!line || typeof line !== 'string') return []
    const trimmedLine = line.trim()
    const cells = line.split('|').map((s) => s.trim())
    // 仅在标准 markdown 外围分隔符场景移除首尾空列，保留真实“空值列”（如：属性 | ）
    if (trimmedLine.startsWith('|') && cells.length > 0 && cells[0] === '') cells.shift()
    if (trimmedLine.startsWith('|') && trimmedLine.endsWith('|') && cells.length > 0 && cells[cells.length - 1] === '') cells.pop()
    return cells
  }

  isWikiTableSeparatorRow(cells = []) {
    if (!Array.isArray(cells) || cells.length === 0) return false
    const validCells = cells.map((c) => String(c || '').trim()).filter((c) => c !== '')
    if (validCells.length === 0) return false
    return validCells.every((c) => /^:?-{2,}:?$/.test(c))
  }

  isLikelyWikiTableLine(line) {
    if (!line || typeof line !== 'string' || !line.includes('|')) return false
    const cells = this.parseWikiTableRow(line)
    if (cells.length < 2) return false
    if (this.isWikiTableSeparatorRow(cells)) return false
    return true
  }

  /** 2列键值表是否显式给了表头（如：属性|数值、技能|说明） */
  isWikiKeyValueHeaderRow(cells = []) {
    if (!Array.isArray(cells) || cells.length < 2) return false
    const left = String(cells[0] || '').trim()
    const right = String(cells[1] || '').trim()
    if (!left || !right) return false
    const plainWord = (s) => /^[A-Za-z\u4e00-\u9fa5]{1,8}$/.test(s)
    if (!plainWord(left) || !plainWord(right)) return false
    const keywords = new Set(['属性', '数值', '说明', '效果', '内容', '名称', '类型', '项目', '条目', '技能', '机制', '等级', 'RANK', 'Rank', 'rank'])
    return keywords.has(left) || keywords.has(right)
  }

  buildWikiSectionBlocks(content = '') {
    const lines = String(content || '').split('\n')
    const blocks = []
    let textBuffer = []
    let tableBuffer = []

    const flushText = () => {
      if (textBuffer.length === 0) return
      const text = textBuffer.join('\n').replace(/\n{3,}/g, '\n\n').trim()
      if (text) blocks.push({ type: 'text', text })
      textBuffer = []
    }

    const flushTable = () => {
      if (tableBuffer.length === 0) return
      const validRows = tableBuffer.filter((row) => Array.isArray(row) && row.length >= 2 && !this.isWikiTableSeparatorRow(row))
      if (validRows.length === 0) {
        tableBuffer = []
        return
      }

      const colCount = validRows.reduce((max, row) => Math.max(max, row.length), 2)
      const normRows = validRows.map((row) => {
        const out = row.slice(0, colCount)
        while (out.length < colCount) out.push('')
        return out
      })

      if (colCount === 2) {
        const hasExplicitHeader = this.isWikiKeyValueHeaderRow(normRows[0])
        if (hasExplicitHeader && normRows.length >= 2) {
          blocks.push({
            type: 'table',
            headers: normRows[0],
            rows: normRows.slice(1)
          })
        } else {
          blocks.push({
            type: 'table',
            headers: ['属性', '数值'],
            rows: normRows
          })
        }
      } else if (normRows.length >= 2) {
        blocks.push({
          type: 'table',
          headers: normRows[0],
          rows: normRows.slice(1)
        })
      } else {
        for (const row of normRows) textBuffer.push(row.join(' | '))
      }
      tableBuffer = []
    }

    for (const rawLine of lines) {
      const line = String(rawLine || '').trimEnd()
      if (this.isLikelyWikiTableLine(line)) {
        flushText()
        tableBuffer.push(this.parseWikiTableRow(line))
        continue
      }
      flushTable()
      if (!line.trim()) {
        if (textBuffer.length > 0 && textBuffer[textBuffer.length - 1] !== '') textBuffer.push('')
      } else {
        textBuffer.push(line)
      }
    }

    flushTable()
    flushText()
    if (blocks.length === 0) blocks.push({ type: 'text', text: '暂无内容' })
    return blocks
  }

  buildWikiRenderSections(sections = []) {
    if (!Array.isArray(sections)) return []
    return sections.map((section) => {
      const chapterTitle = String(section?.chapterTitle || '').trim() || '【章节】'
      const content = this.normalizeWikiSectionContent(section?.content || '') || '暂无内容'
      const blocks = this.buildWikiSectionBlocks(content)
      return {
        chapterTitle,
        content,
        blocks
      }
    })
  }

  estimateWikiViewportHeight(sections = [], hasCover = false) {
    const baseHeight = hasCover ? 1320 : 960
    const textHeight = sections.reduce((sum, section) => {
      const textLength = String(section?.content || '').length
      return sum + Math.min(1600, 140 + Math.ceil(textLength / 36) * 20)
    }, 0)
    return Math.max(1400, Math.min(8200, baseHeight + textHeight))
  }

  async renderWikiImage(data, typeLabel, sections, subTypeId, options = {}) {
    if (!this.e?.runtime?.render) return null
    const pageWidth = 760
    const renderSections = this.buildWikiRenderSections(sections)
    const hideCaption = options.hideCaption === true
    const hideCover = options.hideCover === true
    const showItemName = options.showItemName !== false
    const showTypeLabel = options.showTypeLabel !== false
    const itemName = showItemName ? (data?.name || '未知') : ''
    const typeText = showTypeLabel ? String(typeLabel || '') : ''
    const subtitle = typeof options.subtitle === 'string'
      ? options.subtitle
      : [typeText, itemName].filter(Boolean).join(' · ')
    const pageTitle = itemName ? `${itemName} - 终末地 Wiki` : '终末地 Wiki'
    const caption = hideCaption ? '' : this.renderCaption(Array.isArray(data?.caption) ? data.caption : [])
    const coverUrl = hideCover ? '' : String(data?.cover || '').trim()
    const viewportHeight = this.estimateWikiViewportHeight(renderSections, !!coverUrl)
    const template = this.getRenderableWikiTemplate(subTypeId)
    const { copyright, sys } = getCopyright()
    const renderData = {
      title: '终末地 Wiki',
      pageTitle,
      typeLabel: typeText,
      subtitle,
      showTypeLabel,
      itemName,
      showItemName,
      caption,
      coverUrl,
      sections: renderSections,
      sectionCount: renderSections.length,
      copyright,
      sys,
      pageWidth,
      pluResPath: this.e?.runtime?.path?.plugin?.['endfield-plugin']?.res || ''
    }
    return await this.e.runtime.render('endfield-plugin', template, renderData, {
      scale: 1.6,
      retType: 'base64',
      viewport: { width: pageWidth, height: viewportHeight }
    })
  }

  renderBlock(block, blockMap, opts = {}) {
    if (!block) return ''
    switch (block.kind) {
      case 'text': {
        const t = block.text
        const elements = t?.inline_elements || t?.inlineElements || []
        if (!Array.isArray(elements) || elements.length === 0) return ''
        const parts = []
        for (const el of elements) {
          if (el.kind === 'text') {
            const text = typeof el.text === 'string' ? el.text : el.text?.text
            if (text) parts.push({ text, entry: false })
            continue
          }
          if (el.kind === 'entry') {
            const entry = el.entry || {}
            if (entry.name) {
              parts.push({ text: entry.name, entry: false })
              continue
            }
            if (entry.id) {
              const text = `entry#${entry.id}${entry.count ? `*${entry.count}` : ''}`
              parts.push({ text, entry: true })
            }
            continue
          }
          if (el.kind === 'link' && el.link?.text) {
            parts.push({ text: el.link.text, entry: false })
          }
        }
        let out = ''
        let prevEntry = false
        for (const part of parts) {
          if (!part?.text) continue
          if (out && (part.entry || prevEntry)) out += ' '
          out += part.text
          prevEntry = part.entry
        }
        return out
      }
      case 'table': {
        const includeDataTables = opts.includeDataTables === true
        const table = block.table
        const cellMap = table?.cell_map || table?.cellMap || {}
        const rowIds = table?.row_ids || table?.rowIds || []
        const columnIds = table?.column_ids || table?.columnIds || []
        if (!Object.keys(cellMap).length) return ''
        const renderCell = (cell) => {
          const childIds = cell?.child_ids || cell?.childIds || []
          const parts = []
          for (const childId of childIds) {
            const child = blockMap[childId]
            if (child) parts.push(this.renderBlock(child, blockMap, opts))
          }
          return parts.filter(Boolean).join('').trim() || ''
        }
        const rows = []
        const allCells = []
        if (rowIds.length > 0 && columnIds.length > 0) {
          for (const rowId of rowIds) {
            const rowCells = []
            let hasText = false
            for (const colId of columnIds) {
              const key = `${rowId}_${colId}`
              const cell = cellMap[key]
              const text = cell ? renderCell(cell) : ''
              rowCells.push(text)
              if (text) hasText = true
              allCells.push(text)
            }
            if (hasText) rows.push(rowCells.join(' | '))
          }
        } else {
          for (const cid of Object.keys(cellMap)) {
            const cell = cellMap[cid]
            const text = renderCell(cell)
            if (text) rows.push(text)
          }
        }
        if (!includeDataTables && this.isDataOnlyTable(allCells)) return ''
        return rows.join('\n')
      }
      case 'list': {
        const list = block.list
        const itemMap = list?.item_map || list?.itemMap || {}
        const itemIds = list?.item_ids || list?.itemIds || []
        if (!Object.keys(itemMap).length) return ''
        const items = []
        for (const iid of itemIds) {
          const item = itemMap[iid]
          const childIds = item?.child_ids || item?.childIds || []
          for (const cid of childIds) {
            const c = blockMap[cid]
            if (c) items.push(this.renderBlock(c, blockMap, opts))
          }
        }
        return items.filter(Boolean).map((s) => '· ' + s).join('\n')
      }
      case 'horizontalLine':
        return '────────────'
      default:
        return ''
    }
  }

  getTabEntries(widgetData) {
    if (!widgetData) return []
    const tabDataMap = widgetData.tab_data_map || widgetData.tabDataMap || {}
    const tabList = widgetData.tab_list || widgetData.tabList || []
    const entries = []
    if (Array.isArray(tabList) && tabList.length > 0) {
      for (const tab of tabList) {
        const tabId = tab?.tab_id
        const docId = tabId ? tabDataMap[tabId]?.content : null
        if (docId) entries.push({ title: tab?.title || '', docId })
      }
      return entries
    }
    for (const tabId of Object.keys(tabDataMap)) {
      const docId = tabDataMap[tabId]?.content
      if (docId) entries.push({ title: '', docId })
    }
    return entries
  }

  renderDocumentParts(content, docId, opts = {}) {
    const docMap = content?.document_map || content?.documentMap || {}
    const doc = docMap[docId]
    if (!doc) return { textLines: [], tableLines: [] }
    const blockIds = doc.block_ids || doc.blockIds || []
    const blockMap = doc.block_map || doc.blockMap || {}
    const textLines = []
    const tableLines = []
    for (const bid of blockIds) {
      const block = blockMap[bid]
      if (!block) continue
      if (block.kind === 'horizontalLine') continue
      if (block.kind === 'table') {
        const text = this.renderBlock(block, blockMap, opts)
        if (text) tableLines.push(...text.split('\n').filter(Boolean))
        continue
      }
      const line = this.renderBlock(block, blockMap, opts)
      if (line) textLines.push(line)
    }
    return { textLines, tableLines }
  }

  inferBattleSkillTitle(textLines, tableLines, index) {
    const all = [...textLines, ...tableLines].join('\n')
    if (all.includes('普攻') || all.includes('处决') || all.includes('下落')) return '普通攻击'
    if (all.includes('所需终结技能量') || all.includes('强化普攻')) return '终结技'
    if (all.includes('冷却时间')) return '战技2'
    if (all.includes('技力消耗')) return '战技1'
    return `战斗技能${index + 1}`
  }

  normalizeEliteToken(text = '') {
    return String(text || '')
      .replace(/\s+/g, '')
      .replace(/[：:]/g, '')
      .replace(/[()（）【】\[\]]/g, '')
      .trim()
  }

  extractEliteLevel(...inputs) {
    const candidates = []
    for (const input of inputs) {
      if (Array.isArray(input)) {
        candidates.push(...input)
      } else {
        candidates.push(input)
      }
    }

    for (const item of candidates) {
      const text = String(item || '').trim()
      if (!text) continue
      const levelMatch = text.match(/(?:Lv\.?\s*)?(\d{1,3})\s*级/i)
      if (levelMatch) return `${parseInt(levelMatch[1], 10)}级`
      const rankMatch = text.match(/\bRANK\s*([0-9]{1,2})\b/i)
      if (rankMatch) return `RANK ${rankMatch[1]}`
    }
    return ''
  }

  isEliteGroupToken(token = '') {
    const t = String(token || '')
    return ['基础数据', '基础属性', '能力值', '需求素材', '需求材料', '材料消耗', '素材消耗', '需求'].some((g) => t === g || t.startsWith(g))
  }

  resolveEliteLabel(text, group = '') {
    const t = this.normalizeEliteToken(text)
    const g = this.normalizeEliteToken(group)
    if (!t) return ''

    if (t.includes('基础生命值') || t.includes('基础生命')) return '基础生命值'
    if (t.includes('基础攻击力') || t.includes('基础攻击')) return '基础攻击力'
    if (t === '生命值' || t.includes('生命上限')) return '基础生命值'
    if (t === '攻击力') return '基础攻击力'
    if ((g.includes('基础数据') || g.includes('基础属性')) && (t === '生命值' || t.includes('生命'))) return '基础生命值'
    if ((g.includes('基础数据') || g.includes('基础属性')) && (t === '攻击力' || t.includes('攻击'))) return '基础攻击力'
    for (const attr of ['力量', '敏捷', '智识', '意志']) {
      if (t === attr || t === `${attr}值` || t.startsWith(attr)) return attr
    }
    if (t.includes('需求素材') || t.includes('素材需求') || t.includes('需求材料') || t.includes('材料消耗') || t.includes('素材消耗') || t.includes('消耗材料')) return '需求素材'
    if ((g.includes('需求') || g.includes('素材')) && t.includes('素材')) return '需求素材'
    return ''
  }

  applyEliteValue(values, group, key, val) {
    const label = this.resolveEliteLabel(key, group)
    const value = String(val || '').replace(/^[：:\s-]+/, '').trim()
    if (!label || !value) return

    if (label === '需求素材') {
      if (!values[label]) {
        values[label] = value
      } else if (!values[label].includes(value)) {
        values[label] = `${values[label]}、${value}`
      }
      return
    }
    values[label] = value
  }

  extractEliteInlineValue(cell, label) {
    const text = String(cell || '').trim()
    if (!text) return ''
    const aliasMap = {
      基础生命值: ['基础生命值', '基础生命', '生命值', '生命上限'],
      基础攻击力: ['基础攻击力', '基础攻击', '攻击力'],
      力量: ['力量', '力量值'],
      敏捷: ['敏捷', '敏捷值'],
      智识: ['智识', '智识值'],
      意志: ['意志', '意志值'],
      需求素材: ['需求素材', '素材需求', '需求材料', '材料消耗', '素材消耗', '消耗材料']
    }
    const aliases = (aliasMap[label] || [label]).slice().sort((a, b) => b.length - a.length)
    for (const alias of aliases) {
      const idx = text.indexOf(alias)
      if (idx < 0) continue
      const value = text.slice(idx + alias.length).replace(/^[：:\s-+]+/, '').trim()
      if (value === '值' || value === '力') continue
      if (value) return value
    }
    return ''
  }

  extractEliteValuesFromCells(values, cells = []) {
    const cleanCells = Array.isArray(cells)
      ? cells.map((s) => String(s || '').trim()).filter(Boolean)
      : []
    if (cleanCells.length === 0) return

    let group = ''
    for (let i = 0; i < cleanCells.length; i++) {
      const cell = cleanCells[i]
      const token = this.normalizeEliteToken(cell)
      if (!token) continue

      if (this.isEliteGroupToken(token)) {
        group = cell
        continue
      }

      const kv = cell.split(/[：:]/).map((s) => s.trim()).filter(Boolean)
      if (kv.length >= 2) {
        const colonLabel = this.resolveEliteLabel(kv[0], group)
        if (colonLabel) {
          this.applyEliteValue(values, group, colonLabel, kv.slice(1).join('：'))
          continue
        }
      }

      const label = this.resolveEliteLabel(cell, group)
      if (!label) continue

      let value = this.extractEliteInlineValue(cell, label)

      if (!value) {
        const nextValues = []
        for (let j = i + 1; j < cleanCells.length; j++) {
          const next = cleanCells[j]
          const nextToken = this.normalizeEliteToken(next)
          if (!nextToken) continue
          if (this.isEliteGroupToken(nextToken)) break
          if (this.resolveEliteLabel(next, group)) break
          nextValues.push(next)
          if (label !== '需求素材') break
        }
        if (nextValues.length > 0) value = label === '需求素材' ? nextValues.join('、') : nextValues[0]
      }

      this.applyEliteValue(values, group, label, value)
    }
  }

  parseEliteTextLine(values, line) {
    const text = String(line || '').trim()
    if (!text) return

    if (text.includes('|')) {
      const cells = text.split('|').map((s) => s.trim()).filter(Boolean)
      this.extractEliteValuesFromCells(values, cells)
      return
    }

    const segments = text.split(/[，,；;]/).map((s) => s.trim()).filter(Boolean)
    for (const seg of segments) {
      const kv = seg.split(/[：:]/).map((s) => s.trim()).filter(Boolean)
      if (kv.length >= 2) {
        this.applyEliteValue(values, '', kv[0], kv.slice(1).join('：'))
      } else {
        this.extractEliteValuesFromCells(values, [seg])
      }
    }
  }

  buildEliteTableRows(tableLines = [], fallbackLevel = '', textLines = [], options = {}) {
    const values = {}
    const tableList = Array.isArray(tableLines) ? tableLines : []
    const textList = Array.isArray(textLines) ? textLines : []
    const normalizeMaxLevel = options?.normalizeMaxLevel === true
    const normalizeInitialLevel = options?.normalizeInitialLevel === true
    let levelTitle = this.extractEliteLevel(fallbackLevel, tableList, textList) || String(fallbackLevel || '').trim() || '20级'
    let pendingMaterial = false

    for (const line of tableList) {
      const cells = String(line || '')
        .split('|')
        .map((s) => s.trim())
        .filter((s) => s !== '')
      if (cells.length < 1) continue
      const joined = cells.join('、')

      const lineLevel = this.extractEliteLevel(cells, line)
      if (lineLevel) levelTitle = lineLevel

      if ((cells[0] === '详细属性' || cells[0] === '属性' || cells[0] === '等级') && cells[1]) {
        const headerLevel = this.extractEliteLevel(cells[1]) || cells[1]
        if (headerLevel) levelTitle = headerLevel
      }

      if (pendingMaterial) {
        const hasMaterialLabel = cells.some((cell) => this.resolveEliteLabel(cell, '') === '需求素材')
        if (!hasMaterialLabel && joined) {
          this.applyEliteValue(values, '', '需求素材', joined)
          pendingMaterial = false
          continue
        }
        pendingMaterial = false
      }

      const beforeMaterial = values['需求素材'] || ''
      this.extractEliteValuesFromCells(values, cells)
      const afterMaterial = values['需求素材'] || ''
      const hasMaterialMarker = cells.some((cell) => this.resolveEliteLabel(cell, '') === '需求素材')
      if (hasMaterialMarker && afterMaterial === beforeMaterial) {
        pendingMaterial = true
      }
    }

    for (const line of textList) {
      const lineLevel = this.extractEliteLevel(line)
      if (lineLevel) levelTitle = lineLevel
      this.parseEliteTextLine(values, line)
    }

    if (normalizeMaxLevel && String(levelTitle || '').includes('满级')) {
      levelTitle = '满级'
    }
    if (normalizeInitialLevel && String(levelTitle || '').includes('初始')) {
      levelTitle = '初始'
    }

    const order = ['基础生命值', '基础攻击力', '力量', '敏捷', '智识', '意志']
    const rows = [`等级 | ${levelTitle || '—'}`, ...order.map((name) => `${name} | ${values[name] || '—'}`)]
    return { levelTitle, rows }
  }

  buildOperatorSections(content) {
    const { chapterGroup, widgetMap } = this.getContentMaps(content)
    const sections = []
    for (const ch of chapterGroup) {
      const title = ch?.title || ''
      if (EndfieldWiki.EXCLUDED_CHAPTER_TITLES.includes(title)) continue
      if (title === '能力扩延') {
        const widgets = ch.widgets || []
        const eliteWidgetId = widgets.find((w) => w?.title === '精英化')?.id || 'UUvMydhr'
        const battleWidgetId = widgets.find((w) => w?.title === '战斗技能')?.id || 'wy2mIqZc'
        const talentWidgetId = widgets.find((w) => w?.title === '天赋阵列')?.id || 'go4OZdMl'

        const eliteWidget = widgetMap[eliteWidgetId]
        const eliteTabs = this.getTabEntries(eliteWidget)
        if (eliteTabs.length > 0) {
          const lines = []
          for (let i = 0; i < eliteTabs.length; i++) {
            const tab = eliteTabs[i]
            const parts = this.renderDocumentParts(content, tab.docId, { includeDataTables: true })
            const { rows } = this.buildEliteTableRows(parts.tableLines, tab.title || tab.docId, parts.textLines, {
              normalizeMaxLevel: true,
              normalizeInitialLevel: true
            })
            if (i > 0) lines.push('')
            lines.push('属性 | 数值')
            lines.push(...rows)
          }
          sections.push({ title: '能力扩延', lines })
        }

        const battleWidget = widgetMap[battleWidgetId]
        const battleTabs = this.getTabEntries(battleWidget)
        if (battleTabs.length > 0) {
          const lines = []
          battleTabs.forEach((tab, idx) => {
            const parts = this.renderDocumentParts(content, tab.docId, { includeDataTables: true })
            const skillTitle = this.inferBattleSkillTitle(parts.textLines, parts.tableLines, idx)
            lines.push(`【${skillTitle}】`)
            if (parts.textLines.length > 0) lines.push(...parts.textLines)
            lines.push(...parts.tableLines)
          })
          sections.push({ title: '战斗技能', lines })
        }

        const talentWidget = widgetMap[talentWidgetId]
        const talentTabs = this.getTabEntries(talentWidget)
        if (talentTabs.length > 0) {
          const lines = []
          talentTabs.forEach((tab, idx) => {
            const parts = this.renderDocumentParts(content, tab.docId, { includeDataTables: true })
            const name = parts.textLines[0] || `天赋${idx + 1}`
            lines.push(`【${name}】`)
            if (parts.textLines.length > 1) lines.push(...parts.textLines.slice(1))
            lines.push(...parts.tableLines)
          })
          sections.push({ title: '天赋阵列', lines })
        }
        continue
      }

      if (title === '干员潜能') {
        const widgets = ch.widgets || []
        const potWidgetId = widgets.find((w) => w?.title === '干员潜能')?.id || 'Q0F4IPzk'
        const potWidget = widgetMap[potWidgetId]
        const potTabs = this.getTabEntries(potWidget)
        if (potTabs.length > 0) {
          const lines = []
          for (const tab of potTabs) {
            const parts = this.renderDocumentParts(content, tab.docId, { includeDataTables: true })
            lines.push(...parts.textLines)
          }
          sections.push({ title: '干员潜能', lines })
        }
        continue
      }
    }
    return sections
  }

}

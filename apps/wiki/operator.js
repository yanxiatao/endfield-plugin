import common from '../../../../lib/common/common.js'
import { parseOperatorSections } from './single.js'

function getSectionTitle(section, index) {
  const raw = String(section?.chapterTitle || '').trim()
  if (raw) return raw
  return `【章节${index + 1}】`
}

export async function renderOperatorSubtype(ctx, payload) {
  const { data, typeLabel, subTypeId } = payload || {}
  const sectionResult = parseOperatorSections(ctx, data, typeLabel)
  const header = String(sectionResult?.header || '').trim()
  const sections = Array.isArray(sectionResult?.sections) ? sectionResult.sections : []

  const forwardNodes = []
  const sectionRenderOptions = {
    hideCaption: true,
    hideCover: true,
    showItemName: false,
    showTypeLabel: false,
    subtitle: `${typeLabel} · ${data?.name || '未知'}`
  }
  const description = String(ctx.renderCaption(Array.isArray(data?.caption) ? data.caption : []) || '').trim()
  const descContent = header || description || '暂无描述'
  const descSection = { chapterTitle: '【干员描述】', content: descContent }
  const descImgSegment = await ctx.renderWikiImage(data, typeLabel, [descSection], subTypeId, {
    hideCaption: true,
    showItemName: true,
    showTypeLabel: true
  })
  if (descImgSegment) {
    forwardNodes.push(['【干员描述】', descImgSegment])
  }

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const imgSegment = await ctx.renderWikiImage(data, typeLabel, [section], subTypeId, sectionRenderOptions)
    if (!imgSegment) {
      logger.warn(`[终末地Wiki] 干员分段渲染失败，跳过章节: ${section?.chapterTitle || i + 1}`)
      continue
    }
    forwardNodes.push([getSectionTitle(section, i), imgSegment])
  }

  if (forwardNodes.length > 1) {
    const forwardTitle = `${typeLabel}Wiki · ${data?.name || '未知'}`
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
  if (overviewImg) {
    await ctx.reply(overviewImg)
    return true
  }

  return false
}

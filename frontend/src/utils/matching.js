export const TEXT_EDITABLE_DIMENSIONS = new Set([
  'professional_summary', 'bullet_quality_ownership', 'impact_so_what',
  'keyword_density', 'grammar_spelling_consistency', 'fluff_buzzwords',
  'soft_skills_integration', 'bullet_length_formatting_consistency',
  'relevance_recency', 'specialty_fit_rotation_relevance', 'white_space',
  'additional_context',
])

export function normalizeText(text) {
  return text
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export function findBestMatch(markdown, original) {
  if (!markdown || !original) return null

  // Tier 1: Exact match
  const exactIdx = markdown.indexOf(original)
  if (exactIdx !== -1) {
    return { index: exactIdx, length: original.length, text: original, type: 'exact' }
  }

  // Tier 2: Normalized match — find first and last significant words in original markdown
  const normMd = normalizeText(markdown)
  const normOrig = normalizeText(original)
  if (normMd.indexOf(normOrig) === -1) {
    // Normalized text not found, skip to Tier 3
  } else {
    const words = normOrig.split(/\s+/).filter(w => w.length > 1)
    if (words.length >= 2) {
      const firstWord = words[0]
      const lastWord = words[words.length - 1]
      const fwRegex = new RegExp('\\b' + firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
      const lwRegex = new RegExp('\\b' + lastWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
      const fwMatch = fwRegex.exec(markdown)
      if (fwMatch) {
        const startIdx = fwMatch.index
        const lwMatch = lwRegex.exec(markdown.substring(startIdx))
        if (lwMatch) {
          const endIdx = startIdx + lwMatch.index + lwMatch[0].length
          const extracted = markdown.substring(startIdx, endIdx)
          if (normalizeText(extracted) === normOrig) {
            return { index: startIdx, length: endIdx - startIdx, text: extracted, type: 'normalized' }
          }
        }
      }
    } else if (words.length === 1) {
      const wRegex = new RegExp('\\b' + words[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
      const wMatch = wRegex.exec(markdown)
      if (wMatch) {
        return { index: wMatch.index, length: wMatch[0].length, text: wMatch[0], type: 'normalized' }
      }
    }
  }

  // Tier 3: Fuzzy word match — search for word sequences in original markdown directly
  const origWords = normOrig.split(/\s+/).filter(w => w.length > 1)
  if (origWords.length < 2) return null

  for (let seqLen = Math.min(origWords.length, 6); seqLen >= 2; seqLen--) {
    for (let start = 0; start <= origWords.length - seqLen; start++) {
      const seq = origWords.slice(start, start + seqLen)
      const firstWord = seq[0]

      const wordRegex = new RegExp('\\b' + firstWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
      const firstMatch = wordRegex.exec(markdown)
      if (!firstMatch) continue

      const matchStart = firstMatch.index

      let cursor = matchStart + firstMatch[0].length
      let allFound = true
      for (let w = 1; w < seq.length; w++) {
        const wRegex = new RegExp('\\b' + seq[w].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
        const wMatch = wRegex.exec(markdown.substring(cursor, cursor + 200))
        if (wMatch) {
          cursor += wMatch.index + wMatch[0].length
        } else {
          allFound = false
          break
        }
      }

      if (allFound) {
        // cursor is already at the end of the last matched word
        const text = markdown.substring(matchStart, cursor)
        return { index: matchStart, length: text.length, text, type: 'fuzzy' }
      }
    }
  }

  return null
}

/**
 * 久谦等页面常见：先展示「深度思考」再展示「正文」。
 * 若在整段文本中匹配到独立标题行（或 Markdown # 正文），只返回该标题之后内容；未匹配则返回原 trim，避免误删。
 */
export function preferAnswerBodyFromFlatText(full: string): string {
  const normalized = full.replace(/\r\n/g, "\n");
  const headingRe =
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:正文|报告正文|正式回答|最终回答|【正文】)\s*(?:\n+|$)/m;
  const m = headingRe.exec(normalized);
  if (!m) return full.trim();
  const rest = normalized.slice(m.index + m[0].length).trim();
  return rest.length > 0 ? rest : full.trim();
}

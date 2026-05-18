/**
 * 使用点号路径读取嵌套字段（不支持含 [0] 的数组下标，避免引入额外依赖）。
 * 例如 path 为 "data.task.id" 时依次访问 obj.data.task.id。
 */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * 深拷贝并在所有字符串中替换占位符（{{query}}、{{taskId}}、{{traceId}} 等由调用方传入）。
 */
export function deepReplacePlaceholders<T>(value: T, replacements: Record<string, string>): T {
  const replacer = (s: string): string => {
    let out = s;
    for (const [key, val] of Object.entries(replacements)) {
      out = out.split(`{{${key}}}`).join(val);
    }
    return out;
  };

  function walk(v: unknown): unknown {
    if (typeof v === "string") return replacer(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(o)) {
        next[k] = walk(val);
      }
      return next;
    }
    return v;
  }

  return walk(value) as T;
}

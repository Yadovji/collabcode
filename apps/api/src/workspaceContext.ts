export type ContextText = { toString(): string };
type SymbolReference = { name: string; kind: string; line: number };
const sensitiveDirectories = new Set(["node_modules", ".git", "dist", "build", "coverage", ".ssh", ".aws", ".gnupg", ".azure", "secrets", "keys", "certificates"]);
const binaryExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".tar", ".jar", ".class", ".exe", ".dll", ".so", ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".mp3", ".sqlite", ".db"]);

function collectSymbols(source: string): SymbolReference[] {
  const patterns: Array<[string, RegExp]> = [
    ["function", /(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([\w$]+)/g],
    ["type", /(?:^|\n)\s*(?:export\s+)?(?:declare\s+)?(?:class|interface|type|enum)\s+([\w$]+)/g],
    ["value", /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=/g]
  ];
  const found: SymbolReference[] = [];
  for (const [kind, pattern] of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match.index === undefined) continue;
      const nameOffset = match.index + match[0].lastIndexOf(match[1]);
      found.push({ name: match[1], kind, line: source.slice(0, nameOffset).split("\n").length });
    }
  }
  return found.sort((a, b) => a.line - b.line).slice(0, 60);
}

function collectImports(source: string): string[] {
  return [...source.matchAll(/^\s*import\s+(?:type\s+)?(?:.*?\s+from\s+)?["']([^"']+)["']/gm)]
    .map((match) => match[1]).slice(0, 20);
}

function makeSnippet(source: string, terms: string[], active: boolean) {
  const lines = source.split("\n");
  if (active || source.length <= 1600) {
    const text = source.slice(0, active ? 16000 : 1600);
    return { text, lineStart: 1, lineEnd: text.split("\n").length };
  }
  const lineScores = lines.map((line) => terms.reduce((sum, term) => sum + (line.toLowerCase().includes(term) ? 1 : 0), 0));
  const bestLine = lineScores.reduce((best, score, index) => score > lineScores[best] ? index : best, 0);
  const lineStart = lineScores[bestLine] > 0 ? Math.max(0, bestLine - 12) : 0;
  let lineEnd = Math.min(lines.length, lineStart + 25);
  let snippet = lines.slice(lineStart, lineEnd).join("\n");
  while (snippet.length > 1600 && lineEnd > lineStart + 1) {
    lineEnd--;
    snippet = lines.slice(lineStart, lineEnd).join("\n");
  }
  if (snippet.length > 1600) snippet = snippet.slice(0, 1600);
  const actualLineEnd = lineStart + snippet.split("\n").length - 1;
  return { text: snippet, lineStart: lineStart + 1, lineEnd: actualLineEnd };
}

export function selectWorkspaceContext(
  entries: Iterable<[string, ContextText]>,
  prompt: string,
  activePath: string | undefined,
  selection: string,
  maxFiles = 16
) {
  const terms = prompt.toLowerCase().match(/[a-z0-9_./-]{3,}/g) || [];
  const files = [...entries].filter(([name, text]) => {
    const parts = name.toLowerCase().split("/");
    const base = parts.at(-1) || "";
    const extension = base.includes(".") ? `.${base.split(".").pop()}` : "";
    return !parts.some((part) => sensitiveDirectories.has(part))
      && !/^\.env(?:\.|$)/i.test(base)
      && !/^\.(npmrc|pypirc|netrc|dockerconfigjson)$/.test(base)
      && !/^(id_rsa|id_ed25519|id_ecdsa|id_dsa)(?:\..*)?$/.test(base)
      && !/(\.pem|\.key|\.p12|\.pfx|\.p8|\.der|\.crt|\.cer|credentials?|secrets?|service-account)(?:$|[._-])/i.test(base)
      && !binaryExtensions.has(extension)
      && !text.toString().includes("\0");
  }).map(([name, text]) => {
    const source = text.toString();
    const searchable = `${name}\n${source}`.toLowerCase();
    const score = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0) + (name === activePath ? 100 : 0);
    return { name, source, score };
  }).sort((a, b) => Number(b.name === activePath) - Number(a.name === activePath) || b.score - a.score || a.name.localeCompare(b.name)).slice(0, maxFiles)
    .map(({ name, source }) => ({ name, ...makeSnippet(source, terms, name === activePath), symbols: collectSymbols(source), imports: collectImports(source) }));
  return JSON.stringify({ activeFile: activePath || null, selection: selection.slice(0, 12000), files });
}

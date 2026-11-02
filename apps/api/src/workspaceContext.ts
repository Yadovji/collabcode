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

export function analyzeWorkspaceSource(source: string) {
  return { symbols: collectSymbols(source), imports: collectImports(source) };
}

export function isWorkspaceFileIndexable(name: string, source: string): boolean {
  const parts = name.toLowerCase().replaceAll("\\", "/").split("/");
  const base = parts.at(-1) || "";
  const extension = base.includes(".") ? `.${base.split(".").pop()}` : "";
  const sensitiveContent = [
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bAIza[0-9A-Za-z_-]{35}\b/,
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/
  ];
  return !parts.some((part) => sensitiveDirectories.has(part))
    && !/^\.env(?:\.|$)/i.test(base)
    && !/^\.(npmrc|pypirc|netrc|dockerconfigjson)$/i.test(base)
    && !/^(id_rsa|id_ed25519|id_ecdsa|id_dsa)(?:\..*)?$/i.test(base)
    && !/(\.pem|\.key|\.p12|\.pfx|\.p8|\.der|\.crt|\.cer|credentials?|secrets?|service-account)(?:$|[._-])/i.test(base)
    && !binaryExtensions.has(extension)
    && !source.includes("\0")
    && Buffer.byteLength(source, "utf8") <= 100_000
    && !sensitiveContent.some((pattern) => pattern.test(source));
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
  const files = [...entries].map(([name, text]) => ({ name, source: text.toString() }))
    .filter(({ name, source }) => isWorkspaceFileIndexable(name, source)).map(({ name, source }) => {
    const searchable = `${name}\n${source}`.toLowerCase();
    const score = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0) + (name === activePath ? 100 : 0);
    return { name, source, score, ...analyzeWorkspaceSource(source) };
  }).sort((a, b) => Number(b.name === activePath) - Number(a.name === activePath) || b.score - a.score || a.name.localeCompare(b.name)).slice(0, maxFiles)
    .map(({ name, source, symbols, imports }) => ({ name, ...makeSnippet(source, terms, name === activePath), symbols, imports }));
  return JSON.stringify({ activeFile: activePath || null, selection: selection.slice(0, 12000), files });
}

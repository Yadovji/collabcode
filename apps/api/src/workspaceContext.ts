export type ContextText = { toString(): string };

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
    return !parts.some((part) => ["node_modules", ".git", "dist", "build", "coverage"].includes(part))
      && !/^\.env(?:\.|$)/i.test(base)
      && !/(\.pem|\.key|\.p12|\.pfx|credentials|secrets?)(?:$|\.)/i.test(base)
      && !text.toString().includes("\0");
  }).map(([name, text]) => {
    const source = text.toString();
    const searchable = `${name}\n${source}`.toLowerCase();
    const score = terms.reduce((total, term) => total + (searchable.includes(term) ? 1 : 0), 0) + (name === activePath ? 100 : 0);
    return { name, text: source, score };
  }).sort((a, b) => Number(b.name === activePath) - Number(a.name === activePath) || b.score - a.score || a.name.localeCompare(b.name)).slice(0, maxFiles)
    .map(({ name, text }) => ({ name, text: text.slice(0, name === activePath ? 16000 : 1600) }));
  return JSON.stringify({ activeFile: activePath || null, selection: selection.slice(0, 12000), files });
}

export type ContextText = { toString(): string };
const sensitiveDirectories = new Set(["node_modules", ".git", "dist", "build", "coverage", ".ssh", ".aws", ".gnupg", ".azure", "secrets", "keys", "certificates"]);
const binaryExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".tar", ".jar", ".class", ".exe", ".dll", ".so", ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".mp3", ".sqlite", ".db"]);

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
    return { name, text: source, score };
  }).sort((a, b) => Number(b.name === activePath) - Number(a.name === activePath) || b.score - a.score || a.name.localeCompare(b.name)).slice(0, maxFiles)
    .map(({ name, text }) => ({ name, text: text.slice(0, name === activePath ? 16000 : 1600) }));
  return JSON.stringify({ activeFile: activePath || null, selection: selection.slice(0, 12000), files });
}

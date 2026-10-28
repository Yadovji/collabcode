export const DEFAULT_ROOM_ID = "welcome";

export const SOCKET_EVENTS = {
  join: "workspace:join",
  documentSync: "document:sync",
  documentUpdate: "document:update",
  awarenessSync: "awareness:sync",
  awarenessUpdate: "awareness:update",
  fileCreate: "file:create",
  fileDelete: "file:delete",
  error: "workspace:error"
} as const;

export type Collaborator = {
  name: string;
  color: string;
};

export const STARTER_FILES: Record<string, string> = {
  "src/index.ts": `// Welcome to CollabCode!\n// Open this room in another browser tab and edit together.\n\nfunction greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet("world"));\n`,
  "README.md": `# CollabCode workspace\n\nA shared TypeScript project. Changes are synchronized live with everyone in this room.\n\n- Edit files together\n- Add a file from the explorer\n- Share the room using the link in the top bar\n`,
  "package.json": `{"name":"collab-workspace","private":true,"scripts":{"start":"tsx src/index.ts"}}\n`
};

export function isSafeFilePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 160) return false;
  if (value.startsWith("/") || value.includes("\\") || value.includes("..")) return false;
  return /^[\w.-]+(?:\/[\w.-]+)*$/.test(value) && !value.split("/").some((part) => part.startsWith("."));
}

export function getLanguageForPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  const languages: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    json: "json", md: "markdown", css: "css", html: "html", py: "python",
    yml: "yaml", yaml: "yaml", sql: "sql"
  };
  return (extension && languages[extension]) || "plaintext";
}

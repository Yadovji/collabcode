export type WebsitePreviewResult = {
  html: string | null;
  warnings: string[];
};

const MAX_PREVIEW_CHARACTERS = 500_000;
const SCRIPT_TYPES = new Set([
  "",
  "text/javascript",
  "application/javascript",
  "text/ecmascript",
  "application/ecmascript"
]);

function getFile(files: Record<string, string>, path: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(files, path) ? files[path] : undefined;
}

export const WEBSITE_STARTER_FILES: Record<string, string> = {
  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My shared website</title>
    <link rel="stylesheet" href="styles.css" />
    <script defer src="script.js"></script>
  </head>
  <body>
    <main class="card">
      <p class="eyebrow">COLLABCODE PREVIEW</p>
      <h1>Hello from our workspace</h1>
      <p>This page is made from three shared files: HTML, CSS, and JavaScript.</p>
      <button id="hello-button" type="button">Try the JavaScript</button>
      <p id="message" aria-live="polite"></p>
    </main>
  </body>
</html>
`,
  "styles.css": `:root { font-family: system-ui, sans-serif; color: #18202d; background: #eef0ff; }
* { box-sizing: border-box; }
body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; }
.card { width: min(100%, 560px); padding: 40px; border-radius: 20px; background: white; box-shadow: 0 18px 55px #28215a20; }
.eyebrow { color: #725bea; font-size: 12px; font-weight: 700; letter-spacing: .12em; }
h1 { margin: 12px 0; font-size: clamp(30px, 7vw, 48px); letter-spacing: -.04em; }
p { color: #60697a; line-height: 1.65; }
button { margin-top: 12px; padding: 12px 18px; border: 0; border-radius: 9px; color: white; background: #725bea; font: inherit; font-weight: 650; cursor: pointer; }
button:hover { background: #5e47d4; }
#message { min-height: 1.6em; color: #34765e; font-weight: 600; }
`,
  "script.js": `const button = document.querySelector("#hello-button");
const message = document.querySelector("#message");

button?.addEventListener("click", () => {
  if (message) message.textContent = "JavaScript is running in the sandboxed preview.";
});
`
};

function extensionOf(path: string): string {
  return path.split(".").pop()?.toLowerCase() || "";
}

function mimeTypeFor(path: string): string {
  const types: Record<string, string> = {
    css: "text/css",
    csv: "text/csv",
    gif: "image/gif",
    html: "text/html",
    ico: "image/x-icon",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    js: "text/javascript",
    json: "application/json",
    md: "text/markdown",
    png: "image/png",
    svg: "image/svg+xml",
    txt: "text/plain",
    webp: "image/webp"
  };
  return types[extensionOf(path)] || "text/plain";
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function dataUrl(value: string, mime: string): string {
  return `data:${mime};charset=utf-8;base64,${toBase64(value)}`;
}

function resolveWorkspacePath(fromPath: string, reference: string): string | null {
  const value = reference.trim();
  if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return null;

  let pathname = value.split(/[?#]/, 1)[0];
  try { pathname = decodeURIComponent(pathname); }
  catch { /* Keep the original path if it contains invalid percent encoding. */ }
  const parts = pathname.startsWith("/") ? [] : fromPath.split("/").slice(0, -1);
  for (const part of pathname.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/") || null;
}

function isExternalReference(reference: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(reference.trim());
}

function rewriteCss(
  css: string,
  fromPath: string,
  files: Record<string, string>,
  visiting = new Set<string>()
): string {
  const withImports = css.replace(/@import\s+(?:"([^"]+)"|'([^']+)')/gi, (whole, doubleQuoted: string | undefined, singleQuoted: string | undefined) => {
    const reference = doubleQuoted ?? singleQuoted ?? "";
    const path = resolveWorkspacePath(fromPath, reference);
    const contents = path ? getFile(files, path) : undefined;
    if (!path || contents === undefined || extensionOf(path) !== "css" || visiting.has(path)) return whole;
    const nextVisiting = new Set(visiting);
    nextVisiting.add(path);
    const nested = rewriteCss(contents, path, files, nextVisiting);
    return `@import url("${dataUrl(nested, "text/css")}")`;
  });

  return withImports.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi, (whole, doubleQuoted: string | undefined, singleQuoted: string | undefined, unquoted: string | undefined) => {
    const reference = (doubleQuoted ?? singleQuoted ?? unquoted ?? "").trim();
    if (isExternalReference(reference)) return whole;
    const path = resolveWorkspacePath(fromPath, reference);
    const contents = path ? getFile(files, path) : undefined;
    if (!path || contents === undefined) return whole;
    if (extensionOf(path) === "css") {
      if (visiting.has(path)) return "url(\"data:text/css,\")";
      const nextVisiting = new Set(visiting);
      nextVisiting.add(path);
      return `url("${dataUrl(rewriteCss(contents, path, files, nextVisiting), "text/css")}")`;
    }
    return `url("${dataUrl(contents, mimeTypeFor(path))}")`;
  });
}

function scriptRunner(source: string): string {
  const encoded = toBase64(source);
  return `(()=>{const run=()=>{const binary=atob("${encoded}");const bytes=Uint8Array.from(binary,(char)=>char.charCodeAt(0));(0,eval)(new TextDecoder().decode(bytes));};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",run,{once:true});else run();})();`;
}

export function buildWebsitePreview(files: Record<string, string>): WebsitePreviewResult {
  const totalCharacters = Object.values(files).reduce((total, value) => total + value.length, 0);
  if (totalCharacters > MAX_PREVIEW_CHARACTERS) {
    return { html: null, warnings: ["Preview is limited to 500,000 characters across workspace files."] };
  }

  const entryPath = getFile(files, "index.html") !== undefined ? "index.html" : getFile(files, "src/index.html") !== undefined ? "src/index.html" : null;
  if (!entryPath) return { html: null, warnings: ["Add index.html (or src/index.html) to choose the website entry point."] };

  const warnings: string[] = [];
  const document = new DOMParser().parseFromString(getFile(files, entryPath) || "", "text/html");
  document.querySelectorAll("base, meta[http-equiv='refresh']").forEach((element) => element.remove());

  document.querySelectorAll<HTMLLinkElement>("link[rel~='stylesheet'][href]").forEach((link) => {
    const reference = link.getAttribute("href") || "";
    const path = resolveWorkspacePath(entryPath, reference);
    const stylesheet = path ? getFile(files, path) : undefined;
    if (path && stylesheet !== undefined && extensionOf(path) === "css") {
      link.href = dataUrl(rewriteCss(stylesheet, path, files), "text/css");
    } else if (path && !isExternalReference(reference)) {
      warnings.push(`Could not find stylesheet: ${reference}`);
    }
  });

  document.querySelectorAll<HTMLScriptElement>("script").forEach((script) => {
    const type = (script.getAttribute("type") || "").trim().toLowerCase();
    if (type === "module") {
      warnings.push("JavaScript modules and import statements are not supported in this first preview version.");
      script.remove();
      return;
    }
    if (!SCRIPT_TYPES.has(type)) return;

    const reference = script.getAttribute("src");
    let source = script.textContent || "";
    if (reference) {
      const path = resolveWorkspacePath(entryPath, reference);
      const workspaceSource = path ? getFile(files, path) : undefined;
      if (workspaceSource !== undefined && path) source = workspaceSource;
      else if (path && !isExternalReference(reference)) {
        warnings.push(`Could not find JavaScript file: ${reference}`);
        script.remove();
        return;
      } else {
        return;
      }
    }

    script.removeAttribute("src");
    script.removeAttribute("async");
    script.removeAttribute("defer");
    script.textContent = scriptRunner(source);
  });

  document.querySelectorAll<HTMLStyleElement>("style").forEach((style) => {
    style.textContent = rewriteCss(style.textContent || "", entryPath, files);
  });
  document.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    element.setAttribute("style", rewriteCss(element.getAttribute("style") || "", entryPath, files));
  });

  const resourceAttributes: Array<[string, string]> = [
    ["img[src], source[src], audio[src], video[src], track[src], input[type='image'][src]", "src"],
    ["video[poster]", "poster"],
    ["link[rel~='icon'][href]", "href"]
  ];
  for (const [selector, attribute] of resourceAttributes) {
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      const reference = element.getAttribute(attribute) || "";
      if (isExternalReference(reference)) return;
      const path = resolveWorkspacePath(entryPath, reference);
      const contents = path ? getFile(files, path) : undefined;
      if (path && contents !== undefined) element.setAttribute(attribute, dataUrl(contents, mimeTypeFor(path)));
      else if (path) warnings.push(`Could not find asset: ${reference}`);
    });
  }

  const reporter = document.createElement("script");
  reporter.textContent = `(()=>{const send=(message)=>parent.postMessage({type:"collabcode-preview-error",message:String(message).slice(0,500)},"*");window.addEventListener("error",(event)=>send(event.message||"JavaScript error"));window.addEventListener("unhandledrejection",(event)=>send(event.reason?.message||event.reason||"Unhandled promise rejection"));})();`;
  document.head.prepend(reporter);

  return { html: `<!doctype html>${document.documentElement.outerHTML}`, warnings: [...new Set(warnings)] };
}

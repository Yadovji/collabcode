import { useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { MonacoBinding } from "y-monaco";
import { getLanguageForPath } from "@collab/shared";

type Props = { path: string; text: Y.Text; awareness: Awareness; onSelectionChange?: (selection: string) => void };

export function CollaborativeEditor({ path, text, awareness, onSelectionChange }: Props) {
  const bindingRef = useRef<MonacoBinding | null>(null);
  const selectionListenerRef = useRef<{ dispose: () => void } | null>(null);

  const onMount: OnMount = (editor, monaco) => {
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, getLanguageForPath(path));
      bindingRef.current = new MonacoBinding(text, model, new Set([editor]), awareness);
      selectionListenerRef.current = editor.onDidChangeCursorSelection(() => {
        const selection = editor.getSelection();
        const selectedText = selection && !selection.isEmpty() ? model.getValueInRange(selection).slice(0, 12000) : "";
        onSelectionChange?.(selectedText);
      });
    }
  };

  useEffect(() => {
    return () => { selectionListenerRef.current?.dispose(); bindingRef.current?.destroy(); };
  }, []);

  return <Editor
    height="100%"
    path={path}
    defaultLanguage={getLanguageForPath(path)}
    defaultValue={text.toString()}
    onMount={onMount}
    theme="vs-dark"
    options={{
      automaticLayout: true,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
      fontSize: 13,
      lineHeight: 22,
      minimap: { enabled: false },
      padding: { top: 16, bottom: 20 },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: "smooth",
      renderLineHighlight: "gutter",
      overviewRulerBorder: false,
      tabSize: 2,
      wordWrap: "on"
    }}
  />;
}

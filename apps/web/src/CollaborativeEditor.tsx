import { useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { MonacoBinding } from "y-monaco";
import { getLanguageForPath } from "@collab/shared";

export type ReviewSelection = { lineStart: number; lineEnd: number; text: string };
type Props = { path: string; text: Y.Text; awareness: Awareness; readOnly?: boolean; onSelectionChange?: (selection: string) => void; onReviewSelectionChange?: (selection: ReviewSelection) => void };

export function CollaborativeEditor({ path, text, awareness, readOnly = false, onSelectionChange, onReviewSelectionChange }: Props) {
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
        const position = selection?.getStartPosition() || editor.getPosition();
        const endPosition = selection?.getEndPosition() || position;
        if (position) {
          const lineStart = Math.min(position.lineNumber, endPosition?.lineNumber || position.lineNumber);
          const lineEnd = Math.max(position.lineNumber, endPosition?.lineNumber || position.lineNumber);
          const textForLines = model.getLinesContent().slice(lineStart - 1, lineEnd).join("\n");
          onReviewSelectionChange?.({ lineStart, lineEnd, text: textForLines.slice(0, 12000) });
        }
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
      readOnly,
      domReadOnly: readOnly,
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

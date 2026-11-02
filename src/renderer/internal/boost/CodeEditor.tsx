import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { EditorState } from '@codemirror/state';
import { basicSetup, EditorView } from 'codemirror';
import { useEffect, useRef } from 'react';

const THEME = EditorView.theme({
  '&': { height: '100%', fontSize: '12.5px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  // Palette colours, so the editor follows light and dark (.ui-light).
  '.cm-gutters': {
    background: 'var(--color-neutral-50)',
    borderRight: '1px solid var(--color-neutral-200)',
    color: 'var(--color-neutral-400)',
  },
  '.cm-activeLine, .cm-activeLineGutter': { background: 'var(--color-neutral-50)' },
  '.cm-content': { caretColor: 'var(--color-neutral-800)' },
});

/**
 * A CodeMirror 6 editor (PLAN.md section 3: lighter than Monaco). `initial` is read once; remount
 * with a `key` to load different text.
 */
export function CodeEditor(props: {
  initial: string;
  language: 'css' | 'js';
  onChange: (text: string) => void;
  testId: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const initial = useRef(props.initial);
  const onChange = useRef(props.onChange);
  useEffect(() => {
    onChange.current = props.onChange;
  }, [props.onChange]);

  const { language } = props;
  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial.current,
        extensions: [
          basicSetup,
          language === 'css' ? css() : javascript(),
          EditorView.lineWrapping,
          THEME,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChange.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    return () => view.destroy();
  }, [language]);

  return (
    <div
      ref={host}
      className="h-72 overflow-hidden rounded-xl border border-neutral-200 bg-white"
      data-testid={props.testId}
    />
  );
}

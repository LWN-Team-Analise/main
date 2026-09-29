import { useImperativeHandle, useRef } from 'react';
import { TEXT } from '../../airflow/config';
import { range } from '../../lib/math';

/** Vertical rail that shows how far the airflow sequence has progressed. */
export default function ScrollCue({ ref }) {
  const rootRef = useRef(null);

  useImperativeHandle(
    ref,
    () => ({
      update(progress) {
        const el = rootRef.current;
        if (!el) return;
        el.style.setProperty('--progress', progress.toFixed(4));
        el.style.setProperty('--label', (1 - range(progress, TEXT.cue.start, TEXT.cue.end)).toFixed(3));
      },
    }),
    [],
  );

  return (
    <div ref={rootRef} className="scroll-cue" aria-hidden="true">
      <span className="scroll-cue__label">Role para explorar</span>
      <span className="scroll-cue__track">
        <span className="scroll-cue__fill" />
      </span>
      <span className="scroll-cue__index">Fluxo de ar</span>
    </div>
  );
}

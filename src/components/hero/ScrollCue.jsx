import { useImperativeHandle, useRef } from 'react';
import { useStrings } from '../../i18n/strings';
import { range } from '../../lib/math';
import { TEXT } from './timeline';

/** Vertical rail that shows how far through the hero the visitor has scrolled. */
export default function ScrollCue({ ref }) {
  const rootRef = useRef(null);
  const t = useStrings();

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
      <span className="scroll-cue__label">{t.hero.scroll}</span>
      <span className="scroll-cue__track">
        <span className="scroll-cue__fill" />
      </span>
    </div>
  );
}

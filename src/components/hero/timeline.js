// Hero copy timing on wide screens, in hero scroll progress (0–1): the
// description resolves line by line, then the buttons appear; the scroll cue's
// label fades as soon as scrolling starts.
export const TEXT = {
  description: { start: 0.08, end: 0.78, window: 0.18 },
  actions: { start: 0.78, end: 0.9 },
  cue: { start: 0, end: 0.06 },
};

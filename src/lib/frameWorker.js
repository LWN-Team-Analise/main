// Web Worker: turns an .mp4 into a sequence of compressed stills.
//
// Every frame is decoded with WebCodecs, cropped to the canvas' aspect ratio
// ("cover"), scaled to the requested size and re-encoded as a JPEG blob. The
// page keeps those blobs (~100–200 KB each) and only decodes a small window of
// them back into bitmaps around the current scroll position, so every frame is
// available instantly without holding the whole video uncompressed in memory.
//
// in:  { src, width, height, quality }
// out: { type: 'meta', total } · { type: 'frame', index, blob } · { type: 'done' } · { type: 'error', message }

import { demux } from './mp4';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

self.onmessage = async ({ data }) => {
  const { src, width, height, quality = 0.88 } = data;
  try {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`${response.status} ${src}`);
    const buffer = await response.arrayBuffer();

    const track = demux(buffer);
    if (!track) throw new Error('unsupported container');
    const config = {
      codec: track.codec,
      codedWidth: track.codedWidth,
      codedHeight: track.codedHeight,
      description: track.description,
    };
    const support = await VideoDecoder.isConfigSupported(config);
    if (!support.supported) throw new Error(`unsupported codec ${track.codec}`);

    self.postMessage({ type: 'meta', total: track.samples.length });

    const aspect = width / height;
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingQuality = 'high';

    let out = 0;
    let encoding = 0;
    let failure = null;

    const decoder = new VideoDecoder({
      output(frame) {
        const index = out++;
        const fw = frame.displayWidth;
        const fh = frame.displayHeight;
        const sw = fw / fh > aspect ? fh * aspect : fw;
        const sh = fw / fh > aspect ? fh : fw / aspect;
        ctx.drawImage(frame, (fw - sw) / 2, (fh - sh) / 2, sw, sh, 0, 0, width, height);
        // Drawn: the decoder can have its buffer back straight away.
        frame.close();
        encoding++;
        // convertToBlob snapshots the canvas synchronously, so the next frame
        // can be drawn while this one is still being encoded.
        canvas
          .convertToBlob({ type: 'image/jpeg', quality })
          .then((blob) => self.postMessage({ type: 'frame', index, blob }))
          .catch((error) => {
            failure = error;
          })
          .finally(() => encoding--);
      },
      error(error) {
        failure = error;
      },
    });
    decoder.configure(config);

    for (const s of track.samples) {
      if (failure) throw failure;
      decoder.decode(
        new EncodedVideoChunk({
          type: s.key ? 'key' : 'delta',
          timestamp: Math.round(((s.dts + s.cts) * 1e6) / track.timescale),
          duration: Math.round((s.duration * 1e6) / track.timescale),
          data: new Uint8Array(buffer, s.offset, s.size),
        }),
      );
      // Back-pressure: never let decoded-but-unencoded snapshots pile up.
      while (!failure && (decoder.decodeQueueSize > 6 || encoding > 6)) await wait(2);
    }
    await decoder.flush();
    while (encoding > 0) await wait(4);
    decoder.close();
    if (failure) throw failure;
    self.postMessage({ type: 'done' });
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error?.message ?? error) });
  }
};

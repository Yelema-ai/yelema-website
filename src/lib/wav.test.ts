import assert from "node:assert/strict";
import { test } from "node:test";
import { downsample, encodeWav, WAV_RATE } from "./wav.ts";

test("a WAV that Aethex reads: RIFF/WAVE header, mono PCM 16-bit at 16 kHz, samples clamped", () => {
  const wav = encodeWav(new Float32Array([0, 1, -1, 2]));
  const view = new DataView(wav.buffer);
  const tag = (at: number) => String.fromCharCode(...wav.subarray(at, at + 4));
  assert.deepEqual([tag(0), tag(8), tag(12), tag(36)], ["RIFF", "WAVE", "fmt ", "data"]);
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), WAV_RATE);
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(wav.length, 44 + 8);
  assert.deepEqual([1, 2, 3, 4].map((i) => view.getInt16(42 + i * 2, true)), [0, 0x7fff, -0x8000, 0x7fff]);
});

test("downsampling to 16 kHz averages the samples, and leaves a slower stream as it is", () => {
  const out = downsample(new Float32Array([0, 1, 0.5, 0.5, 1, 1]), 48_000);
  assert.deepEqual([...out], [...Float32Array.from([0.5, 2.5 / 3])]);
  const slow = new Float32Array([0.1, 0.2]);
  assert.equal(downsample(slow, 16_000), slow);
});

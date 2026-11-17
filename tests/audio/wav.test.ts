import { describe, expect, it } from "vitest";
import {
  downsample,
  encodeWav,
  isAcceptedWav,
  MAX_RECORDING_SEC,
  parseWav,
  TARGET_SAMPLE_RATE,
  toTargetWav,
} from "@/lib/audio/wav";
import { wavOf } from "../media/fakes";

describe("WAV (SPEC 10)", () => {
  it("kodlanan WAV okunur: 16 kHz, mono, 16 bit, süre", () => {
    const info = parseWav(wavOf(2.5));
    expect(info).toMatchObject({ sampleRate: 16_000, channels: 1, bitsPerSample: 16, format: 1 });
    expect(info!.durationSec).toBeCloseTo(2.5, 3);
    expect(isAcceptedWav(info)).toBe(true);
  });

  it("45 sn ≈ 1,44 MB (< 2 MB sınırı)", () => {
    expect(wavOf(MAX_RECORDING_SEC).byteLength).toBe(44 + 45 * 16_000 * 2);
    expect(wavOf(MAX_RECORDING_SEC).byteLength).toBeLessThan(2 * 1024 * 1024);
  });

  it("örnekler kırpılır ve 16 bit'e çevrilir", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2, -2, 0.5]), 16_000);
    const view = new DataView(wav.buffer);
    expect([0, 1, 2, 3, 4, 5].map((i) => view.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 32767, -32768, 16383]);
  });

  it("reddedilenler: 48 kHz, stereo, çok kısa, çok uzun, WAV değil", () => {
    expect(isAcceptedWav(parseWav(wavOf(2, 48_000)))).toBe(false);
    expect(isAcceptedWav(parseWav(wavOf(0.2)))).toBe(false);
    expect(isAcceptedWav(parseWav(wavOf(46)))).toBe(false);
    expect(parseWav(new Uint8Array(100))).toBeNull();
    const stereo = wavOf(2);
    new DataView(stereo.buffer).setUint16(22, 2, true);
    expect(isAcceptedWav(parseWav(stereo))).toBe(false);
  });

  it("örnek azaltma: iOS 48 kHz / 44,1 kHz → 16 kHz; süre korunur", () => {
    for (const rate of [48_000, 44_100]) {
      const input = new Float32Array(rate * 3).map((_, i) => Math.sin((2 * Math.PI * 440 * i) / rate));
      const out = downsample(input, rate, TARGET_SAMPLE_RATE);
      expect(out.length).toBe(Math.floor((rate * 3) / (rate / TARGET_SAMPLE_RATE)));
      expect(out.length / TARGET_SAMPLE_RATE).toBeCloseTo(3, 2);
      expect(Math.max(...out)).toBeLessThanOrEqual(1);
      const info = parseWav(encodeWav(out, TARGET_SAMPLE_RATE));
      expect(info!.sampleRate).toBe(16_000);
      expect(isAcceptedWav(info)).toBe(true);
    }
  });

  it("sabit sinyal azaltmada korunur; örnek artırma reddedilir", () => {
    const out = downsample(new Float32Array(4800).fill(0.25), 48_000, 16_000);
    expect(out.every((x) => Math.abs(x - 0.25) < 1e-6)).toBe(true);
    expect(() => downsample(new Float32Array(10), 8_000, 16_000)).toThrow();
  });
});

describe("toTargetWav (eval-verbatim kayıtları)", () => {
  it("48 kHz stereo → 16 kHz mono; süre korunur; zaten uygun olan aynen döner", () => {
    const frames = 48_000 * 2;
    const bytes = new Uint8Array(44 + frames * 4);
    const v = new DataView(bytes.buffer);
    const ascii = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
    ascii(0, "RIFF"); v.setUint32(4, 36 + frames * 4, true); ascii(8, "WAVE"); ascii(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, 48_000, true);
    v.setUint32(28, 48_000 * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
    ascii(36, "data"); v.setUint32(40, frames * 4, true);
    for (let f = 0; f < frames; f++) {
      v.setInt16(44 + f * 4, 8192, true);
      v.setInt16(44 + f * 4 + 2, -8192, true);
    }
    const out = toTargetWav(bytes)!;
    const info = parseWav(out)!;
    expect(isAcceptedWav(info)).toBe(true);
    expect(info.durationSec).toBeCloseTo(2, 2);
    expect(new DataView(out.buffer).getInt16(44 + 100, true)).toBe(0); // kanallar ortalandı
    const ok = wavOf(2);
    expect(toTargetWav(ok)).toBe(ok);
    expect(toTargetWav(new Uint8Array(10))).toBeNull();
  });
});

// WAV kodlama/okuma ve örnek azaltma (docs/SPEC.md 10). Saf: tarayıcıda kaydedici, sunucuda
// `POST /api/items/:id/speech` doğrulaması kullanır.

/** Transkript için hedef biçim: 16 kHz, mono, 16 bit PCM. */
export const TARGET_SAMPLE_RATE = 16_000;
/** Kayıt üst sınırı (PRD F6). */
export const MAX_RECORDING_SEC = 45;
/** Gövde sınırı (CLAUDE.md: ses yüklemesi 2 MB). 45 sn ≈ 1,44 MB. */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
/** Bundan kısa kayıt gönderilmez (yanlışlıkla iki kez dokunma). */
export const MIN_RECORDING_SEC = 0.5;

/**
 * Doğrusal aralıklı ortalamayla örnek azaltma (`inRate` → `outRate`). iOS Safari `AudioContext`'i
 * 44,1/48 kHz açar ve istenen hızı yok sayar; kaydedici 16 kHz'e kendisi indirir.
 */
export function downsample(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (outRate > inRate) throw new Error("örnek artırma desteklenmiyor");
  if (outRate === inRate) return input.slice();
  const ratio = inRate / outRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    // Her çıkış örneği, karşılık gelen giriş aralığının ortalaması (basit kenar yumuşatma).
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = end > start ? sum / (end - start) : 0;
  }
  return out;
}

/** Mono Float32 örnekler (-1..1) → 16 bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt bölümü boyu
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bayt/sn
  view.setUint16(32, 2, true); // blok hizası
  view.setUint16(34, 16, true); // bit/örnek
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  format: number;
  dataBytes: number;
  durationSec: number;
}

/** RIFF/WAVE başlığını okur (bölümleri sırayla gezer). Geçersizse `null`. */
export function parseWav(bytes: Uint8Array): WavInfo | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let offset = 12;
  let fmt: Omit<WavInfo, "dataBytes" | "durationSec"> | null = null;
  while (offset + 8 <= bytes.length) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      if (size < 16 || body + 16 > bytes.length) return null;
      fmt = {
        format: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bitsPerSample: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!fmt || fmt.sampleRate === 0 || fmt.channels === 0 || fmt.bitsPerSample === 0) return null;
      const dataBytes = Math.min(size, bytes.length - body);
      const bytesPerSec = fmt.sampleRate * fmt.channels * (fmt.bitsPerSample / 8);
      return { ...fmt, dataBytes, durationSec: dataBytes / bytesPerSec };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

/** Sunucunun kabul ettiği biçim: 16 kHz mono 16 bit PCM, 0,5–45 sn (+ yarım saniye pay). */
export function isAcceptedWav(info: WavInfo | null): info is WavInfo {
  return (
    info !== null &&
    info.format === 1 &&
    info.channels === 1 &&
    info.bitsPerSample === 16 &&
    info.sampleRate === TARGET_SAMPLE_RATE &&
    info.durationSec >= MIN_RECORDING_SEC &&
    info.durationSec <= MAX_RECORDING_SEC + 0.5
  );
}

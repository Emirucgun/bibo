// Bas-konuş kaydedici (docs/SPEC.md 10, PRD F6). Yalnızca tarayıcıda; bir kullanıcı dokunuşundan
// sonra `start()` çağrılır (iOS Safari mikrofonu ve `AudioContext`'i ancak dokunuşla açar).
// - Mono, istemcide 16 kHz'e örnek azaltma (iOS istenen örnekleme hızını yok sayar).
// - Sessizlikte durmaz: kayıt yalnızca `stop()` ile ya da 45 sn sınırında biter.
// - Ses yalnızca bellekte tutulur; diske ya da tarayıcı depolamasına yazılmaz.
import { downsample, encodeWav, MAX_RECORDING_SEC, TARGET_SAMPLE_RATE } from "./wav";

export type RecorderErrorCode = "unsupported" | "permission_denied" | "no_microphone" | "failed";

export class RecorderError extends Error {
  constructor(public readonly code: RecorderErrorCode) {
    super(code);
    this.name = "RecorderError";
  }
}

export interface Recording {
  wav: Uint8Array;
  durationSec: number;
}

type AudioContextCtor = typeof AudioContext;

export class WavRecorder {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private length = 0;
  private limitTimer: ReturnType<typeof setTimeout> | null = null;

  /** 45 sn sınırına gelince çağrılır; arayüz `stop()` ile kaydı alır. */
  constructor(private readonly onLimit?: () => void) {}

  static supported(): boolean {
    return (
      typeof window !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext)
    );
  }

  async start(): Promise<void> {
    if (!WavRecorder.supported()) throw new RecorderError("unsupported");
    const Ctor: AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: AudioContextCtor }).webkitAudioContext;
    // Bağlam getUserMedia'dan önce, dokunuşun içinde açılır (iOS).
    this.context = new Ctor();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      await this.cleanup();
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") throw new RecorderError("permission_denied");
      if (name === "NotFoundError" || name === "OverconstrainedError") throw new RecorderError("no_microphone");
      throw new RecorderError("failed");
    }
    if (this.context.state === "suspended") await this.context.resume();

    this.chunks = [];
    this.length = 0;
    this.source = this.context.createMediaStreamSource(this.stream);
    // ScriptProcessorNode eski ama iOS Safari dahil her yerde çalışır; AudioWorklet ayrı dosya ister.
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => {
      const channel = event.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(channel));
      this.length += channel.length;
    };
    this.source.connect(this.processor);
    // Bazı tarayıcılar işlemciyi hedefe bağlanmadan çalıştırmaz; çıkış sessizdir (çıkış tamponu boş).
    this.processor.connect(this.context.destination);
    this.limitTimer = setTimeout(() => this.onLimit?.(), MAX_RECORDING_SEC * 1000);
  }

  /** Kaydı bitirir ve 16 kHz mono WAV döner. */
  async stop(): Promise<Recording> {
    const rate = this.context?.sampleRate ?? TARGET_SAMPLE_RATE;
    const all = new Float32Array(this.length);
    let offset = 0;
    for (const c of this.chunks) {
      all.set(c, offset);
      offset += c.length;
    }
    await this.cleanup();
    // 45 sn'den fazlası kesilir (zamanlayıcı gecikmesi payı).
    const capped = all.subarray(0, Math.min(all.length, Math.floor(rate * MAX_RECORDING_SEC)));
    const samples = downsample(capped, rate, TARGET_SAMPLE_RATE);
    return { wav: encodeWav(samples, TARGET_SAMPLE_RATE), durationSec: samples.length / TARGET_SAMPLE_RATE };
  }

  /** Kaydı atar (sayfa değişimi, iptal). */
  async cancel(): Promise<void> {
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    if (this.limitTimer) clearTimeout(this.limitTimer);
    this.limitTimer = null;
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.context && this.context.state !== "closed") await this.context.close().catch(() => undefined);
    this.processor = null;
    this.source = null;
    this.stream = null;
    this.context = null;
    this.chunks = [];
    this.length = 0;
  }
}

import {
  Audio as ThreeAudio,
  AudioListener,
  AudioLoader,
  Group,
  MathUtils,
  PositionalAudio,
  Vector3,
} from "three"
import { Outcome, OutcomeType } from "../model/outcome"
import { R } from "../model/physics/constants"
import { getRenderQuality } from "./renderquality"
import { gainForImpact } from "../utils/impactgain"
import { AUDIO_BANKS, AudioBankDefinition, SoundKey } from "./audiobank"
type Voice = ThreeAudio | PositionalAudio

export class Sound {
  listener: AudioListener
  audioLoader: AudioLoader
  readonly root = new Group()
  private readonly pools = new Map<SoundKey, Voice[]>()
  private readonly cursors = new Map<SoundKey, number>()
  private readonly voiceStartedAt = new WeakMap<Voice, number>()
  private readonly contactPosition = new Vector3()
  private readonly maxConcurrentVoices = 24
  lastOutcomeTime = 0
  lastOutcomeIndex = 0
  lastOutcomesRef: Outcome[] | null = null

  constructor(readonly loadAssets: boolean) {
    if (!loadAssets) return

    this.listener = new AudioListener()
    this.audioLoader = new AudioLoader()
    this.configureMasterMixer()
    for (const [key, definition] of Object.entries(AUDIO_BANKS)) {
      this.loadPool(key as SoundKey, definition)
    }
  }

  private configureMasterMixer() {
    const compressor = this.listener.context.createDynamicsCompressor()
    compressor.threshold.value = -8
    compressor.knee.value = 10
    compressor.ratio.value = 3
    compressor.attack.value = 0.014
    compressor.release.value = 0.14
    this.listener.setFilter(compressor)

    try {
      const stored = Number.parseFloat(
        globalThis.localStorage?.getItem("break-builder.master-volume") ?? "0.8"
      )
      this.listener.setMasterVolume(Number.isFinite(stored) ? stored : 0.8)
    } catch {
      this.listener.setMasterVolume(0.8)
    }
  }

  private loadPool(key: SoundKey, definition: AudioBankDefinition) {
    definition.paths.forEach((path) => {
      this.audioLoader.load(
        path,
        (buffer) => {
          const useSpatial =
            definition.spatial && getRenderQuality().name !== "low"
          const voices = this.pools.get(key) ?? []
          for (let i = 0; i < definition.voicesPerSample; i++) {
            const voice = useSpatial
              ? new PositionalAudio(this.listener)
              : new ThreeAudio(this.listener)
            voice.setBuffer(buffer)
            voice.setLoop(false)
            if (voice instanceof PositionalAudio) {
              voice.setRefDistance(R * 18)
              voice.setMaxDistance(R * 180)
              voice.setRolloffFactor(0.8)
              this.root.add(voice)
            }
            voices.push(voice)
          }
          this.pools.set(key, voices)
        },
        undefined,
        () => console.warn(`Failed to load sound: ${path}`)
      )
    })
  }

  addCameraToListener(camera) {
    if (this.listener) camera.add(this.listener)
  }

  private play(
    key: SoundKey,
    volume: number,
    detune = 0,
    position?: Vector3,
    delay = 0
  ) {
    if (!this.loadAssets) return
    const context = this.listener.context
    if (context?.state === "suspended") {
      if (globalThis.navigator?.userActivation?.hasBeenActive) {
        const retryPosition = position?.clone()
        void context
          .resume()
          .then(() => this.play(key, volume, detune, retryPosition, delay))
          .catch(() => {})
      }
      return
    }

    const voices = this.pools.get(key)
    if (!voices?.length) return
    const activeVoices = [...this.pools.values()]
      .flat()
      .filter((voice) => voice.isPlaying)
    if (activeVoices.length >= this.maxConcurrentVoices) {
      const oldest = activeVoices.reduce((candidate, voice) =>
        (this.voiceStartedAt.get(voice) ?? 0) <
        (this.voiceStartedAt.get(candidate) ?? 0)
          ? voice
          : candidate
      )
      oldest.stop()
    }

    const cursor = this.cursors.get(key) ?? 0
    const orderedVoices = voices.map(
      (_, index) => voices[(cursor + index) % voices.length]
    )
    const available = orderedVoices.find((voice) => !voice.isPlaying)
    const voice = available ?? voices[cursor % voices.length]
    this.cursors.set(key, cursor + 1)
    if (voice.isPlaying) voice.stop()

    voice.setVolume(MathUtils.clamp(volume, 0, 1))
    const jitter = AUDIO_BANKS[key].detuneJitterCents ?? 12
    voice.setDetune(detune + MathUtils.randFloat(-jitter, jitter))
    if (position && voice instanceof PositionalAudio) {
      voice.position.copy(position)
      voice.updateMatrixWorld(true)
    }
    this.voiceStartedAt.set(voice, context.currentTime + delay)
    voice.play(delay)
  }

  private outcomePosition(outcome: Outcome) {
    if (outcome.ballA && outcome.ballB && outcome.ballA !== outcome.ballB) {
      return this.contactPosition
        .copy(outcome.ballA.pos)
        .add(outcome.ballB.pos)
        .multiplyScalar(0.5)
    }
    return outcome.ballA?.pos
  }

  outcomeToSound(outcome: Outcome) {
    const position = this.outcomePosition(outcome)
    if (outcome.type === OutcomeType.Collision) {
      const gain = gainForImpact(outcome.incidentSpeed, 3.6, 0.94)
      this.play("collision", gain, 0, position)
      const bodyGain = MathUtils.smoothstep(gain, 0.18, 0.94) * 0.27
      if (bodyGain > 0) {
        this.play("collisionBody", bodyGain, -18, position, 0.008)
      }
    } else if (outcome.type === OutcomeType.Pot) {
      const gain = gainForImpact(outcome.incidentSpeed, 3, 0.85)
      this.play("potMouth", gain, -80, position)
      this.play("potRoll", gain * 0.38, -160, position, 0.045)
      this.play("potDrop", gain * 0.58, -240, position, 0.13)
    } else if (outcome.type === OutcomeType.Cushion) {
      this.play(
        "cushion",
        gainForImpact(outcome.incidentSpeed, 4, 0.72),
        -80,
        position
      )
    } else if (outcome.type === OutcomeType.Hit) {
      this.play(
        "cue",
        gainForImpact(outcome.incidentSpeed, 3.2, 1),
        0,
        position
      )
    }
  }

  processOutcomes(outcomes: Outcome[]) {
    if (outcomes !== this.lastOutcomesRef) {
      this.lastOutcomeTime = -1
      this.lastOutcomeIndex = 0
      this.lastOutcomesRef = outcomes
    } else if (
      this.lastOutcomeTime === -1 ||
      this.lastOutcomeIndex > outcomes.length
    ) {
      this.lastOutcomeIndex = 0
    }

    for (let i = this.lastOutcomeIndex; i < outcomes.length; i++) {
      const outcome = outcomes[i]
      if (outcome.timestamp > this.lastOutcomeTime) {
        this.lastOutcomeTime = outcome.timestamp
        this.lastOutcomeIndex = i + 1
        this.outcomeToSound(outcome)
        break
      }
    }
  }

  playNotify() {
    this.play("potMouth", 0.7)
  }

  playSuccess(pitch) {
    this.play("success", 0.1, pitch * 100 - 2200)
  }
}

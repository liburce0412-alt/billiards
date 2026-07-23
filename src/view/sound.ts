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

type SoundKey = "collision" | "cue" | "cushion" | "pot" | "success"
type Voice = ThreeAudio | PositionalAudio

const definitions: Record<SoundKey, { paths: string[]; spatial: boolean }> = {
  collision: {
    paths: [
      "sounds/ballcollision-room-01.ogg",
      "sounds/ballcollision-room-02.ogg",
      "sounds/ballcollision-room-03.ogg",
      "sounds/ballcollision-room-04.ogg",
    ],
    spatial: true,
  },
  cue: { paths: ["sounds/cue.ogg"], spatial: true },
  cushion: { paths: ["sounds/cushion.ogg"], spatial: true },
  pot: { paths: ["sounds/pot.ogg"], spatial: true },
  success: { paths: ["sounds/success.ogg"], spatial: false },
}

export class Sound {
  listener: AudioListener
  audioLoader: AudioLoader
  readonly root = new Group()
  private readonly pools = new Map<SoundKey, Voice[]>()
  private readonly cursors = new Map<SoundKey, number>()
  private readonly contactPosition = new Vector3()
  lastOutcomeTime = 0
  lastOutcomeIndex = 0
  lastOutcomesRef: Outcome[] | null = null

  constructor(readonly loadAssets: boolean) {
    if (!loadAssets) return

    this.listener = new AudioListener()
    this.audioLoader = new AudioLoader()
    for (const [key, definition] of Object.entries(definitions)) {
      this.loadPool(key as SoundKey, definition.paths, definition.spatial)
    }
  }

  private loadPool(key: SoundKey, paths: string[], spatial: boolean) {
    const voicesPerBuffer = Math.max(2, Math.ceil(4 / paths.length))
    paths.forEach((path) => {
      this.audioLoader.load(
        path,
        (buffer) => {
          const useSpatial = spatial && getRenderQuality().name !== "low"
          const voices = this.pools.get(key) ?? []
          for (let i = 0; i < voicesPerBuffer; i++) {
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
      if (globalThis.navigator?.userActivation?.hasBeenActive) context.resume()
      return
    }

    const voices = this.pools.get(key)
    if (!voices?.length) return
    const cursor = this.cursors.get(key) ?? 0
    const orderedVoices = voices.map(
      (_, index) => voices[(cursor + index) % voices.length]
    )
    const available = orderedVoices.find((voice) => !voice.isPlaying)
    const voice = available ?? voices[cursor % voices.length]
    this.cursors.set(key, cursor + 1)
    if (voice.isPlaying) voice.stop()

    voice.setVolume(MathUtils.clamp(volume, 0, 1))
    voice.setDetune(detune + MathUtils.randFloat(-22, 22))
    if (position && voice instanceof PositionalAudio) {
      voice.position.copy(position)
      voice.updateMatrixWorld(true)
    }
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
      this.play(
        "collision",
        gainForImpact(outcome.incidentSpeed, 4.5, 0.9),
        outcome.incidentSpeed * 8,
        position
      )
    } else if (outcome.type === OutcomeType.Pot) {
      const gain = gainForImpact(outcome.incidentSpeed, 3, 0.85)
      this.play("pot", gain, -180, position)
      this.play("pot", gain * 0.45, -720, position, 0.055)
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
        gainForImpact(outcome.incidentSpeed, 5, 0.9),
        0,
        position
      )
    }
  }

  processOutcomes(outcomes: Outcome[]) {
    if (
      this.lastOutcomeTime === -1 ||
      outcomes !== this.lastOutcomesRef ||
      this.lastOutcomeIndex > outcomes.length
    ) {
      this.lastOutcomeIndex = 0
      this.lastOutcomesRef = outcomes
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
    this.play("pot", 0.7)
  }

  playSuccess(pitch) {
    this.play("success", 0.1, pitch * 100 - 2200)
  }
}

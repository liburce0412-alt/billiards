export type SoundKey =
  | "collision"
  | "cue"
  | "cushion"
  | "potMouth"
  | "potRoll"
  | "potDrop"
  | "success"

export interface AudioBankDefinition {
  paths: string[]
  spatial: boolean
  voicesPerSample: number
}

export const AUDIO_BANKS: Record<SoundKey, AudioBankDefinition> = {
  collision: {
    paths: [
      "sounds/ballcollision-room-01.ogg",
      "sounds/ballcollision-room-02.ogg",
      "sounds/ballcollision-room-03.ogg",
      "sounds/ballcollision-room-04.ogg",
    ],
    spatial: true,
    voicesPerSample: 2,
  },
  cue: {
    paths: ["sounds/cue.ogg", "sounds/cue-02.ogg", "sounds/cue-03.ogg"],
    spatial: true,
    voicesPerSample: 2,
  },
  cushion: {
    paths: [
      "sounds/cushion.ogg",
      "sounds/cushion-02.ogg",
      "sounds/cushion-03.ogg",
    ],
    spatial: true,
    voicesPerSample: 2,
  },
  potMouth: {
    paths: [
      "sounds/pot.ogg",
      "sounds/pot-mouth-02.ogg",
      "sounds/pot-mouth-03.ogg",
    ],
    spatial: true,
    voicesPerSample: 2,
  },
  potRoll: {
    paths: [
      "sounds/pot-roll-01.ogg",
      "sounds/pot-roll-02.ogg",
      "sounds/pot-roll-03.ogg",
    ],
    spatial: true,
    voicesPerSample: 1,
  },
  potDrop: {
    paths: [
      "sounds/pot-drop-01.ogg",
      "sounds/pot-drop-02.ogg",
      "sounds/pot-drop-03.ogg",
    ],
    spatial: true,
    voicesPerSample: 1,
  },
  success: {
    paths: ["sounds/success.ogg"],
    spatial: false,
    voicesPerSample: 2,
  },
}

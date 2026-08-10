import { expect } from "chai"
import { webcrypto } from "node:crypto"
import { TextEncoder } from "node:util"
import {
  buildGameUrl,
  buildInviteUrl,
  generateRoomCode,
  normaliseRoomCode,
  shouldShowLauncher,
} from "../../src/launcherconfig"
import { normaliseDisplayRoomCode } from "../../src/network/client/roomidentity"

Object.defineProperty(globalThis, "crypto", {
  configurable: true,
  value: webcrypto,
})
Object.defineProperty(globalThis, "TextEncoder", {
  configurable: true,
  value: TextEncoder,
})

describe("Launcher configuration", () => {
  it("shows the launcher at the bare site root", () => {
    expect(shouldShowLauncher(new URLSearchParams())).to.be.true
    expect(shouldShowLauncher(new URLSearchParams("quality=high"))).to.be.true
  })

  it("keeps existing direct game links compatible", () => {
    expect(shouldShowLauncher(new URLSearchParams("ruletype=eightball"))).to.be
      .false
    expect(shouldShowLauncher(new URLSearchParams("bot=TheFarJaw"))).to.be.false
    expect(shouldShowLauncher(new URLSearchParams("state=replay"))).to.be.false
  })

  it("builds a local AI game URL", async () => {
    const url = new URL(
      await buildGameUrl(
        {
          rule: "eightball",
          opponent: "ai",
          botLevel: 9,
          quality: "high",
        },
        "https://example.test/index.html?old=value#fragment"
      )
    )
    expect(url.searchParams.get("play")).to.equal("1")
    expect(url.searchParams.get("ruletype")).to.equal("eightball")
    expect(url.searchParams.get("bot")).to.equal("TheFarJaw")
    expect(url.searchParams.get("botLevel")).to.equal("9")
    expect(url.searchParams.get("practice")).to.equal("false")
    expect(url.searchParams.get("quality")).to.equal("high")
    expect(url.searchParams.has("old")).to.be.false
    expect(url.hash).to.equal("")
  })

  it("builds a practice URL without a bot", async () => {
    const url = new URL(
      await buildGameUrl(
        {
          rule: "snooker",
          opponent: "practice",
          botLevel: 4,
          quality: "balanced",
        },
        "https://example.test/"
      )
    )
    expect(url.searchParams.get("practice")).to.equal("true")
    expect(url.searchParams.has("bot")).to.be.false
  })

  it("builds a local two-player URL with both names and cue styles", async () => {
    const url = new URL(
      await buildGameUrl(
        {
          rule: "eightball",
          opponent: "local",
          botLevel: 4,
          quality: "high",
          player1Name: "小明",
          player2Name: "小红",
          player1Cue: "royal",
          player2Cue: "jade",
        },
        "https://example.test/"
      )
    )
    expect(url.searchParams.get("local")).to.equal("true")
    expect(url.searchParams.get("p1Name")).to.equal("小明")
    expect(url.searchParams.get("p2Name")).to.equal("小红")
    expect(url.searchParams.get("p1Cue")).to.equal("royal")
    expect(url.searchParams.get("p2Cue")).to.equal("jade")
    expect(url.searchParams.has("bot")).to.equal(false)
  })

  it("builds host and guest URLs for the same online room", async () => {
    const host = new URL(
      await buildGameUrl(
        {
          rule: "fourball",
          opponent: "online",
          botLevel: 4,
          quality: "balanced",
          onlineAction: "create",
          roomCode: "银河 房间🎱",
          onlinePlayerName: "房主",
          onlineUserId: "host-id",
        },
        "https://example.test/"
      )
    )
    expect(host.searchParams.get("tableId")).to.match(/^bb3d-v2-[0-9a-f]{32}$/)
    expect(host.searchParams.get("roomCode")).to.equal("银河 房间🎱")
    expect(host.searchParams.get("userName")).to.equal("房主")
    expect(host.searchParams.get("userId")).to.equal("host-id")
    expect(host.searchParams.get("first")).to.equal("true")
    expect(host.searchParams.has("websocketserver")).to.equal(true)

    const guest = new URL(
      await buildGameUrl(
        {
          rule: "fourball",
          opponent: "online",
          botLevel: 4,
          quality: "balanced",
          onlineAction: "join",
          roomCode: "银河　房间🎱",
          onlinePlayerName: "访客",
        },
        "https://example.test/"
      )
    )
    expect(guest.searchParams.get("tableId")).to.equal(
      host.searchParams.get("tableId")
    )
    expect(guest.searchParams.has("first")).to.equal(false)
  })

  it("normalises Unicode room codes and creates launcher invite links", () => {
    expect(normaliseRoomCode("  银河　房间🎱  ")).to.equal("银河 房间🎱")
    expect(generateRoomCode(() => 0)).to.equal("AAAAAA")
    const invite = new URL(
      buildInviteUrl(
        "银河 房间🎱",
        { rule: "nineball", quality: "high" },
        "https://example.test/index.html?play=1"
      )
    )
    expect(invite.searchParams.get("join")).to.equal("银河 房间🎱")
    expect(invite.searchParams.get("roomVersion")).to.equal("2")
    expect(invite.searchParams.get("rule")).to.equal("nineball")
    expect(invite.searchParams.get("quality")).to.equal("high")
    expect(invite.searchParams.has("play")).to.equal(false)
  })

  it("validates visible Unicode room codes without changing letter case", () => {
    expect(normaliseDisplayRoomCode("Ａbc/桌🎱")).to.equal("Abc/桌🎱")
    expect(normaliseDisplayRoomCode("👨‍👩‍👧‍👦".repeat(24))).to.equal("👨‍👩‍👧‍👦".repeat(24))
    expect(() => normaliseDisplayRoomCode("A".repeat(25))).to.throw("最多 24")
    expect(() => normaliseDisplayRoomCode("房间\u0001")).to.throw("控制字符")
    expect(() => normaliseDisplayRoomCode("房间\u202eABC")).to.throw("方向字符")
    expect(() => normaliseDisplayRoomCode("房间\u200bABC")).to.throw("控制字符")
  })
})

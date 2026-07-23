import { expect } from "chai"
import { initDom } from "./dom"
import { fireEvent } from "@testing-library/dom"
import { Container } from "../../src/container/container"
import { Menu } from "../../src/view/menu"
import { Assets } from "../../src/view/assets"
import { Session } from "../../src/network/client/session"
import { CUE_STYLE_STORAGE_KEY } from "../../src/view/cuestyle"
import { TABLE_STYLE_STORAGE_KEY } from "../../src/view/tablestyle"

initDom()

let container: Container

beforeEach(function (done) {
  globalThis.localStorage.removeItem(CUE_STYLE_STORAGE_KEY)
  globalThis.localStorage.removeItem(TABLE_STYLE_STORAGE_KEY)
  container = new Container({
    element: document.getElementById("viewP1"),
    log: (_) => {},
    assets: Assets.localAssets(),
  })
  new Menu(container)
  done()
})

describe("Menu", () => {
  it("opens the cue library and applies a saved style", () => {
    const cueButton = document.getElementById("cueStyle") as HTMLButtonElement
    fireEvent.click(cueButton)

    const selector = document.getElementById("cueSelector")!
    expect(selector.hasAttribute("hidden")).to.be.false
    expect(selector.querySelectorAll("[data-cue-style]")).to.have.lengthOf(6)

    const obsidian = selector.querySelector(
      "[data-cue-style='obsidian']"
    ) as HTMLButtonElement
    fireEvent.click(obsidian)

    expect(container.table.cue.styleId).to.equal("obsidian")
    expect(globalThis.localStorage.getItem(CUE_STYLE_STORAGE_KEY)).to.equal(
      "obsidian"
    )
    expect(obsidian.classList.contains("is-selected")).to.be.true
  })

  it("opens the table library and switches to a saved Chinese table", () => {
    const tableButton = document.getElementById(
      "tableStyle"
    ) as HTMLButtonElement
    fireEvent.click(tableButton)

    const selector = document.getElementById("tableSelector")!
    expect(selector.hasAttribute("hidden")).to.be.false
    expect(selector.querySelectorAll("[data-table-style]")).to.have.lengthOf(6)

    const chineseTable = selector.querySelector(
      "[data-table-style='chinese-ebony']"
    ) as HTMLButtonElement
    fireEvent.click(chineseTable)

    expect(container.view.assets.tableStyleId).to.equal("chinese-ebony")
    expect(globalThis.localStorage.getItem(TABLE_STYLE_STORAGE_KEY)).to.equal(
      "chinese-ebony"
    )
    expect(chineseTable.classList.contains("is-selected")).to.be.true
  })

  it("camera", (done) => {
    const toggleview = document.getElementById("camera") as HTMLButtonElement
    expect(container.view.camera.mode).to.be.equal(
      container.view.camera.topView
    )
    fireEvent.click(toggleview, { target: { value: 1 } })
    expect(container.view.camera.mode).to.be.equal(
      container.view.camera.aimView
    )
    done()
  })

  it("concede notification buttons clear the notification", (done) => {
    const concede = document.getElementById("concede") as HTMLButtonElement
    fireEvent.click(concede)

    const notification = document.getElementById("notification")
    expect(notification?.innerHTML).to.contain("认输")

    const playOn = document.querySelector(
      "[data-notification-action='concede-cancel']"
    ) as HTMLButtonElement
    fireEvent.click(playOn)

    expect(notification?.innerHTML).to.equal("")
    done()
  })

  it("concede confirm in bot mode triggers game over", (done) => {
    Session.init("test-client", "TestPlayer", "test-table", false, true)
    const concede = document.getElementById("concede") as HTMLButtonElement
    fireEvent.click(concede)

    const confirm = document.querySelector(
      "[data-notification-action='concede-confirm']"
    ) as HTMLButtonElement
    fireEvent.click(confirm)

    expect(container.controller.name).to.equal("End")
    const notification = document.getElementById("notification")
    expect(notification?.innerHTML).to.contain("你输了")
    expect(notification?.innerHTML).to.contain("被龙虾击败了 🦞")

    Session.reset()
    done()
  })
})

import { expect } from "chai"
import { initDom } from "./dom"
import { fireEvent } from "@testing-library/dom"
import { Container } from "../../src/container/container"
import { Menu } from "../../src/view/menu"
import { Assets } from "../../src/view/assets"
import { Session } from "../../src/network/client/session"

initDom()

let container: Container

beforeEach(function (done) {
  container = new Container({
    element: document.getElementById("viewP1"),
    log: (_) => {},
    assets: Assets.localAssets(),
  })
  new Menu(container)
  done()
})

describe("Menu", () => {
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

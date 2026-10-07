import { expect, test, type Page } from "@playwright/test"

const gameUrl =
  "/?play=1&platformDemo=1&ruletype=eightball&practice=true&quality=low&camera=2d&tableStyle=american-ivory&environment=spectra"

async function prepareGame(page: Page, quality = "low") {
  await page.addInitScript(() => {
    localStorage.setItem("break-builder.controls-seen.v2", "acknowledged")
    localStorage.setItem("break-builder.social-drawer", "closed")
  })
  await page.goto(gameUrl.replace("quality=low", `quality=${quality}`), {
    waitUntil: "domcontentloaded",
  })
  await page.waitForFunction(
    () =>
      (globalThis as any).container?.view?.assets?.table?.children.length > 0
  )
  await expect(
    page.getByRole("button", {
      name: "确认母球位置并进入开球瞄准",
      exact: true,
    })
  ).toBeVisible()
  await expect(page.locator("#panel")).toBeVisible()
  const socialClose = page.locator("#gameSocialClose")
  if (await socialClose.isVisible()) await socialClose.click()
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity
        )
        .map((animation) => animation.finished.catch(() => undefined))
    )
  })
}

test("3D touch shot holds the strike pose then stands up without chasing the ball", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 915, height: 412 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await prepareGame(page)
  await page.locator("#cueHit").click()
  await page.locator("#camera").tap()
  await expect(page.locator("#camera")).toHaveAttribute(
    "data-camera-mode",
    "3d"
  )
  await expect
    .poll(() =>
      page.evaluate(() => {
        const game = (globalThis as any).container
        const camera = game.view.camera
        return camera.camera.position.distanceTo(
          game.view.robotPlayers.cameraFrame.eye
        )
      })
    )
    .toBeLessThan(0.01)
  await page.evaluate(() => {
    const game = (globalThis as any).container
    const camera = game.view.camera
    const update = camera.update.bind(camera)
    ;(globalThis as any).shotSamples = []
    camera.update = (...args: any[]) => {
      update(...args)
      if (camera.shotView)
        (globalThis as any).shotSamples.push({
          time: camera.shotView.elapsed,
          position: camera.camera.position.toArray(),
          rotation: camera.camera.quaternion.toArray(),
          ball: game.table.cueball.pos.toArray(),
          eye: game.view.robotPlayers.cameraFrame.eye.toArray(),
          firstPerson:
            game.view.robotPlayers.players[game.view.robotPlayers.active].root
              .userData.firstPerson,
        })
    }
  })
  const rail = (await page.locator("#powerSliderContainer").boundingBox())!
  const cdp = await context.newCDPSession(page)
  const point = (y: number) => ({
    id: 1,
    x: rail.x + rail.width / 2,
    y,
    radiusX: 6,
    radiusY: 6,
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(rail.y + 8)],
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [point(rail.y + rail.height * 0.6)],
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })
  await expect
    .poll(() =>
      page.evaluate(() => (globalThis as any).shotSamples.at(-1)?.time ?? 0)
    )
    .toBeGreaterThan(2)
  const samples = await page.evaluate(() => (globalThis as any).shotSamples)
  const held = samples.filter((sample: any) => sample.time <= 1)
  expect(held.length).toBeGreaterThan(3)
  for (const sample of held) {
    expect(sample.position).toEqual(held[0].position)
    expect(sample.rotation).toEqual(held[0].rotation)
  }
  expect(held.at(-1).ball).not.toEqual(held[0].ball)
  const standing = samples.at(-1)
  expect(standing.position).toEqual(standing.eye)
  expect(samples.every((sample: any) => sample.firstPerson)).toBe(true)
  expect(standing.position[2]).toBeGreaterThan(held[0].position[2])
  await page.screenshot({ path: "docs/qa/2026-09-05-shot-pause/standing.png" })
  await context.close()
})

test("Android portrait shows the rotation gate without mounting the game", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await page.goto(gameUrl, { waitUntil: "domcontentloaded" })
  await expect(
    page.getByRole("heading", { name: "横放设备，完整展开球台" })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "进入横屏" })).toBeVisible()
  expect(
    await page.evaluate(() => window.__BREAK_BUILDER_GAME_STARTED__)
  ).not.toBe(true)
  await context.close()
})

for (const quality of ["low", "high"]) {
  test(`low-height landscape separates the HUD, table and shot dock (${quality})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
    })
    const page = await context.newPage()
    await prepareGame(page, quality)

    const layout = await page.evaluate(() => {
      const rect = (selector: string) => {
        const value = document.querySelector(selector)!.getBoundingClientRect()
        return {
          left: value.left,
          top: value.top,
          right: value.right,
          bottom: value.bottom,
        }
      }
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        hud: rect(".tray-score-container"),
        table: rect("#viewP1"),
        dock: rect("#panel"),
        power: rect("#powerSliderContainer"),
        hit: rect("#cueHit"),
        socialOpen: document.body.classList.contains("social-drawer-open"),
      }
    })

    expect(layout.socialOpen).toBe(false)
    expect(layout.hud.bottom).toBeLessThanOrEqual(layout.dock.top + 1)
    expect(layout.dock.left).toBeGreaterThanOrEqual(layout.viewportWidth * 0.88)
    expect(layout.dock.right - layout.dock.left).toBeLessThanOrEqual(
      layout.viewportWidth * 0.12
    )
    expect(layout.dock.bottom - layout.dock.top).toBeGreaterThanOrEqual(
      layout.viewportHeight * 0.6
    )
    // WebGL must continue behind the translucent rail, not leave a blank strip.
    expect(layout.table.right).toBe(layout.viewportWidth)
    expect(layout.table.bottom).toBeLessThanOrEqual(layout.viewportHeight + 1)
    expect(layout.table.bottom - layout.table.top).toBeGreaterThanOrEqual(
      layout.viewportHeight * 0.98
    )
    expect(layout.power.right - layout.power.left).toBeLessThanOrEqual(500)
    expect(layout.power.bottom).toBeLessThanOrEqual(390)
    expect(layout.hit.left).toBeGreaterThanOrEqual(layout.dock.left)
    expect(layout.hit.right).toBeLessThanOrEqual(844)
    expect(layout.hit.bottom).toBeLessThanOrEqual(390)
    await expect(page.locator("#matchChatToggle")).toHaveAttribute(
      "aria-expanded",
      "false"
    )
    await page.locator("#matchChatToggle").click()
    await expect(page.locator("#matchChatToggle")).toHaveAttribute(
      "aria-expanded",
      "true"
    )
    const chat = await page.locator(".chatarea").boundingBox()
    expect(chat!.width).toBeLessThanOrEqual(300)
    expect(chat!.height).toBeLessThanOrEqual(170)
    await page.locator("#cueHit").click()
    await expect(page.locator("#matchChatToggle")).toHaveAttribute(
      "aria-expanded",
      "false"
    )
    await page
      .getByRole("slider", { name: "击球力度", exact: true })
      .press("End")
    const power = await page.evaluate(
      () => (globalThis as any).container.table.cue.aim.power
    )
    expect(power).toBe(17)
    await expect(page.locator("#panel .liquid-glass-fx")).toHaveCount(0)
    await context.close()
  })
}

test("mobile two-finger camera and cue-ball confirmation enter the break controls", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 915, height: 412 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await prepareGame(page)

  await expect(page.locator("#panel")).toHaveAttribute(
    "data-action-mode",
    "placement"
  )
  await expect(page.locator("#cueHit")).toHaveAttribute(
    "aria-label",
    "确认母球位置并进入开球瞄准"
  )

  const cdp = await context.newCDPSession(page)
  const touch = (id: number, x: number, y: number) => ({
    id,
    x,
    y,
    radiusX: 6,
    radiusY: 6,
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touch(1, 330, 160)],
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touch(1, 330, 160), touch(2, 560, 160)],
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [touch(1, 280, 190), touch(2, 640, 225)],
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [touch(2, 640, 225)],
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })
  const cameraAfterGesture = await page.evaluate(() => ({
    stored: localStorage.getItem("billiards-camera-mode"),
    input: (globalThis as any).container.view.getMobileInputState(),
  }))
  expect(cameraAfterGesture.stored).toBe("free")
  expect(cameraAfterGesture.input).toMatchObject({
    state: "idle",
    pointerCount: 0,
  })

  const mobileButtons = await page.evaluate(() => {
    const selectors = [
      ".shot-dock__toggle",
      ".openElevation",
      "#cueHit",
      "#gameOverflowToggle",
    ]
    return selectors.map((selector) => {
      const element = document.querySelector<HTMLElement>(selector)!
      const rect = element.getBoundingClientRect()
      return {
        selector,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      }
    })
  })
  for (let first = 0; first < mobileButtons.length; first++) {
    for (let second = first + 1; second < mobileButtons.length; second++) {
      const a = mobileButtons[first]
      const b = mobileButtons[second]
      const overlapWidth = Math.max(
        0,
        Math.min(a.right, b.right) - Math.max(a.left, b.left)
      )
      const overlapHeight = Math.max(
        0,
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      )
      expect(
        overlapWidth * overlapHeight,
        `${a.selector} overlaps ${b.selector}`
      ).toBe(0)
    }
  }

  await page.locator("#cueHit").click()
  await expect(page.locator("#panel")).toHaveAttribute(
    "data-action-mode",
    "shot"
  )
  await expect(page.locator("#cuePower")).toBeEnabled()
  await page.evaluate(() => {
    localStorage.setItem("break-builder.shot-dock", "collapsed")
    ;(globalThis as any).container.table.cue.aimInputs.setDockCollapsed(true)
    ;(globalThis as any).__repositionClickCount = 0
    ;(globalThis as any).container.table.cue.aimInputs.showRepositionCueBall(
      () => {
        ;(globalThis as any).__repositionClickCount += 1
      }
    )
  })
  await expect(page.locator("#panel")).toHaveAttribute(
    "data-dock-state",
    "expanded"
  )
  await expect(page.locator("#repositionCueBall")).toBeVisible()
  expect(
    await page.locator("#repositionCueBall").evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return document
        .elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2
        )
        ?.closest("#repositionCueBall")?.id
    })
  ).toBe("repositionCueBall")
  await page.locator("#repositionCueBall").click()
  expect(
    await page.evaluate(() => (globalThis as any).__repositionClickCount)
  ).toBe(1)
  const freeBallOverlap = await page.evaluate(() => {
    const freeBall = document
      .querySelector("#repositionCueBall")!
      .getBoundingClientRect()
    return [".openElevation", "#gameOverflowToggle"].map((selector) => {
      const other = document.querySelector(selector)!.getBoundingClientRect()
      return (
        Math.max(
          0,
          Math.min(freeBall.right, other.right) -
            Math.max(freeBall.left, other.left)
        ) *
        Math.max(
          0,
          Math.min(freeBall.bottom, other.bottom) -
            Math.max(freeBall.top, other.top)
        )
      )
    })
  })
  expect(freeBallOverlap).toEqual([0, 0])
  const powerWidth = await page
    .locator("#powerSliderContainer")
    .evaluate((element) => element.getBoundingClientRect().width)
  expect(powerWidth).toBeLessThanOrEqual(560)
  await context.close()
})

test("critical mobile rail actions stay separate and tappable", async ({
  browser,
}) => {
  for (const viewport of [
    { width: 568, height: 320 },
    { width: 844, height: 390 },
    { width: 915, height: 412 },
    { width: 960, height: 432 },
    { width: 1080, height: 480 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: true,
      isMobile: true,
    })
    const page = await context.newPage()
    await prepareGame(page)
    await page.locator("#cueHit").click()
    await page.evaluate(() => {
      ;(globalThis as any).container.table.cue.aimInputs.setDockCollapsed(true)
      ;(globalThis as any).__criticalActionCount = 0
      ;(globalThis as any).container.table.cue.aimInputs.showRepositionCueBall(
        () => {
          ;(globalThis as any).__criticalActionCount += 1
        }
      )
    })
    await expect(page.locator("#panel")).toHaveAttribute(
      "data-dock-state",
      "expanded"
    )

    const actions = await page.evaluate(() => {
      const selectors = [
        ".shot-dock__toggle",
        ".openElevation",
        "#cueHit",
        "#repositionCueBall",
        "#gameOverflowToggle",
      ]
      return selectors.flatMap((selector) => {
        const element = document.querySelector<HTMLElement>(selector)
        if (!element || element.hidden) return []
        const style = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.pointerEvents === "none" ||
          rect.width <= 0 ||
          rect.height <= 0
        ) {
          return []
        }
        return [
          {
            selector,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          },
        ]
      })
    })
    for (let first = 0; first < actions.length; first++) {
      for (let second = first + 1; second < actions.length; second++) {
        const a = actions[first]
        const b = actions[second]
        const overlapWidth = Math.max(
          0,
          Math.min(a.right, b.right) - Math.max(a.left, b.left)
        )
        const overlapHeight = Math.max(
          0,
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        )
        expect(
          overlapWidth * overlapHeight,
          `${viewport.width}x${viewport.height}: ${a.selector} overlaps ${b.selector}`
        ).toBe(0)
      }
    }

    const freeBall = page.locator("#repositionCueBall")
    await expect(freeBall).toBeVisible()
    expect(
      await freeBall.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return document
          .elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
          )
          ?.closest("#repositionCueBall")?.id
      })
    ).toBe("repositionCueBall")
    await freeBall.click()
    expect(
      await page.evaluate(() => (globalThis as any).__criticalActionCount)
    ).toBe(1)
    await context.close()
  }
})

test("desktop game shell keeps one clean social and shot control path", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2048, height: 1080 })
  await prepareGame(page)
  await expect(page.locator(".game-react-status")).toHaveCount(0)
  await expect(page.locator(".shot-radial")).toHaveCount(0)
  await expect(page.locator("#gameSocialDock")).toHaveCount(0)
  await expect(page.locator("#lobbyOverlay")).toBeVisible()

  const tableDetails = await page.evaluate(() => {
    const table = (globalThis as any).container?.view?.assets?.table
    const details = table?.getObjectByName?.("spectra-ivory-table-details")
    return details?.children?.map((child: any) => child.geometry?.type) ?? []
  })
  expect(tableDetails).not.toContain("RingGeometry")
  expect(tableDetails).not.toContain("TorusGeometry")

  await page.locator("#cueHit").click()
  const cameraDistance = await page.evaluate(
    () => (globalThis as any).container?.view?.camera?.distance
  )
  expect(cameraDistance).toBeGreaterThan(0.9)
})

test("desktop settings drawer stays glassy, bounded and keeps the table camera usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2048, height: 1080 })
  await page.addInitScript(() => {
    localStorage.setItem("break-builder.controls-seen.v2", "acknowledged")
    localStorage.setItem("break-builder.social-drawer", "closed")
  })
  await page.goto(gameUrl.replace("quality=low", "quality=adaptive"))
  await page.waitForFunction(
    () =>
      (globalThis as any).container?.view?.assets?.table?.children.length > 0
  )
  const socialClose = page.locator("#gameSocialClose")
  if (await socialClose.isVisible()) await socialClose.click()
  await page.locator("#cueHit").click()
  await page.evaluate(() => {
    ;(globalThis as any).container.lastEventTime = 0
  })
  await page.locator("#menu").click()
  await expect(page.locator("#gameSettingsDrawer")).toBeVisible()

  const drawer = await page.evaluate(() => {
    const panel = document.getElementById("gameSettingsDrawer")!
    const body = panel.querySelector<HTMLElement>(".game-settings__body")!
    const quality = document.getElementById(
      "settingsQuality"
    ) as HTMLSelectElement
    const view = document.getElementById("viewP1")!
    const rect = panel.getBoundingClientRect()
    const hit = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)!
      const target = element.getBoundingClientRect()
      return document
        .elementFromPoint(
          target.left + target.width / 2,
          target.top + target.height / 2
        )
        ?.closest(selector)?.id
    }
    return {
      panelFits: panel.scrollWidth <= panel.clientWidth + 1,
      bodyFits: body.scrollWidth <= body.clientWidth + 1,
      documentFits: document.documentElement.scrollWidth <= innerWidth + 1,
      right: rect.right,
      viewportWidth: innerWidth,
      qualityValue: quality.value,
      qualityText: quality.selectedOptions[0]?.textContent,
      viewZIndex: getComputedStyle(view).zIndex,
      backgroundAlpha: getComputedStyle(panel).backgroundColor,
      lastEventTime: (globalThis as any).container.lastEventTime,
      settingsCameraHit: hit("#settingsCamera"),
      settingsCueHit: hit("#settingsCue"),
      settingsTableHit: hit("#settingsTable"),
    }
  })
  expect(drawer).toMatchObject({
    panelFits: true,
    bodyFits: true,
    documentFits: true,
    qualityValue: "adaptive",
    qualityText: "观感优先自适应",
    viewZIndex: "auto",
    settingsCameraHit: "settingsCamera",
    settingsCueHit: "settingsCue",
    settingsTableHit: "settingsTable",
  })
  expect(drawer.right).toBeLessThanOrEqual(drawer.viewportWidth + 1)
  expect(drawer.backgroundAlpha).toContain("0.74")
  expect(drawer.lastEventTime).toBeGreaterThan(0)
  await expect(page.locator(".tray-score-container")).toBeVisible()

  await page.locator("#settingsEnvironment").selectOption("galaxy")
  const sceneLayering = await page.evaluate(() => {
    const view = (globalThis as any).container.view
    return {
      environmentIndex: view.scene.children.findIndex(
        (child: any) => child.name === "environment-layer"
      ),
      tableIndex: view.scene.children.indexOf(view.assets.table),
      activeEnvironment: view.environmentStyleId,
    }
  })
  expect(sceneLayering.activeEnvironment).toBe("galaxy")
  expect(sceneLayering.environmentIndex).toBeGreaterThanOrEqual(0)
  expect(sceneLayering.environmentIndex).toBeLessThan(sceneLayering.tableIndex)

  await page.locator("#settingsCamera").click()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const container = (globalThis as any).container
        const camera = container.view.camera.camera
        camera.updateMatrixWorld(true)
        return container.table.balls
          .filter((ball: any) => ball.onTable())
          .map((ball: any) => ball.pos.clone().project(camera))
          .filter(
            (point: any) =>
              Math.abs(point.x) <= 1 &&
              Math.abs(point.y) <= 1 &&
              point.z >= -1 &&
              point.z <= 1
          ).length
      })
    )
    .toBeGreaterThanOrEqual(2)
})

test("leaving and re-entering the game keeps exactly one physics loop", async ({
  page,
}) => {
  await prepareGame(page)
  await page.locator("#matchChatToggle").click()
  await expect(page.locator(".chatarea")).toHaveAttribute(
    "data-chat-state",
    "open"
  )
  await page.locator("#menu").click()
  await expect(page.locator("#gameSettingsDrawer")).toBeVisible()
  await page.locator("#gameSettingsClose").click()
  await page.locator("#gameSocialToggle").click()
  await expect(page.locator("#gameSocialDrawer")).toBeVisible()
  await page.evaluate(() => {
    const oldChat = document.createElement("article")
    oldChat.dataset.testid = "old-match-chat"
    document.querySelector("#chatoutput")?.append(oldChat)
    const oldTrayEntry = document.createElement("a")
    oldTrayEntry.dataset.testid = "old-match-tray-entry"
    document.querySelector("#ballTrayList")?.append(oldTrayEntry)
    ;(globalThis as any).__firstBreakBuilderContainer = (
      globalThis as any
    ).container
    history.pushState({}, "", "/?platformDemo=1")
    dispatchEvent(new PopStateEvent("popstate"))
  })
  await expect(page.locator("#launcherStart")).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => ({
        platformRoute: document.body.classList.contains("app-platform-route"),
        activeContainer: Boolean((globalThis as any).container),
        firstDisposed: Boolean(
          (globalThis as any).__firstBreakBuilderContainer?.disposed
        ),
        gameCanvases: document.querySelectorAll("#viewP1 canvas").length,
      }))
    )
    .toEqual({
      platformRoute: true,
      activeContainer: false,
      firstDisposed: true,
      gameCanvases: 0,
    })

  await page.evaluate(() => {
    history.pushState(
      {},
      "",
      "/play?platformDemo=1&ruletype=eightball&practice=true&quality=low&camera=2d&tableStyle=american-ivory&environment=spectra"
    )
    dispatchEvent(new PopStateEvent("popstate"))
  })
  await page.waitForFunction(
    () =>
      (globalThis as any).container &&
      (globalThis as any).container !==
        (globalThis as any).__firstBreakBuilderContainer
  )
  expect(
    await page.evaluate(
      () => document.querySelectorAll("#viewP1 canvas").length
    )
  ).toBe(1)
  await expect(page.locator(".chatarea")).toHaveAttribute(
    "data-chat-state",
    "peek"
  )
  await expect(page.locator("#gameSettingsDrawer")).toBeHidden()
  await expect(page.locator("#gameSocialDrawer")).toBeHidden()
  await expect(page.locator("[data-testid='old-match-chat']")).toHaveCount(0)
  await expect(
    page.locator("[data-testid='old-match-tray-entry']")
  ).toHaveCount(0)

  await page.locator("#matchChatToggle").click()
  await expect(page.locator(".chatarea")).toHaveAttribute(
    "data-chat-state",
    "open"
  )
  await page.locator("#menu").click()
  await expect(page.locator("#gameSettingsDrawer")).toBeVisible()
  await page.locator("#gameSettingsClose").click()
  await page.locator("#gameSocialToggle").click()
  await expect(page.locator("#gameSocialDrawer")).toBeVisible()
})

test("leaving an unread control tutorial restores clickable launcher controls", async ({
  page,
}) => {
  await page.goto(gameUrl)
  await expect(page.locator("#panel")).toBeVisible()
  await expect(page.locator("#controlTutorial")).toBeVisible()

  await page.evaluate(() => {
    history.pushState({}, "", "/?platformDemo=1")
    dispatchEvent(new PopStateEvent("popstate"))
  })

  const start = page.locator("#launcherStart")
  await expect(start).toBeVisible()
  await expect(page.locator("#controlTutorial")).toBeHidden()
  await start.scrollIntoViewIfNeeded()
  expect(
    await start.evaluate((button) => {
      const rect = button.getBoundingClientRect()
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      )
      return hit === button || button.contains(hit)
    })
  ).toBe(true)
  const targetRequest = page.waitForRequest(
    (request) =>
      request.isNavigationRequest() && /\/play\?play=1/.test(request.url())
  )
  await start.click()
  expect((await targetRequest).url()).toMatch(/\/play\?play=1/)
})

test("launcher room form remains scrollable and room fields are readable", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await page.goto("/?platformDemo=1")
  await expect(page.locator("#launcherStart")).toBeVisible()
  await page
    .locator("label:has(input[name='opponent'][value='online'])")
    .click()
  const roomCode = page.locator("#roomCode")
  await expect(roomCode).toBeVisible()
  await expect(roomCode).toHaveAttribute("maxlength", "24")
  await roomCode.scrollIntoViewIfNeeded()
  await expect(roomCode).toBeInViewport()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight >= window.innerHeight
    )
  ).toBe(true)
  await context.close()
})

test("touch match has clear chrome, primary camera control and resets consecutive shots", async ({
  browser,
}) => {
  test.setTimeout(65000)
  const context = await browser.newContext({
    viewport: { width: 915, height: 412 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await prepareGame(page)
  await page.locator("#cueHit").click()
  const camera = page.locator("#camera")
  await expect(camera).toBeVisible()
  await camera.tap()
  await expect(camera).toHaveAttribute("data-camera-mode", "3d")
  // The eye camera blends in from the overview before testing pitch gestures.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const game = (globalThis as any).container
        return game.view.camera.camera.position.distanceTo(
          game.view.robotPlayers.cameraFrame.eye
        )
      })
    )
    .toBeLessThan(0.01)
  const before = await page.evaluate(() => {
    const game = (globalThis as any).container
    return {
      height: game.view.camera.camera.position.z,
      angle: game.table.cue.aim.angle,
    }
  })
  const cdp = await context.newCDPSession(page)
  const point = (x: number, y: number) => ({
    id: 1,
    x,
    y,
    radiusX: 6,
    radiusY: 6,
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(410, 210)],
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [point(410, 180)],
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })
  await expect
    .poll(() =>
      page.evaluate(
        () => (globalThis as any).container.view.camera.camera.position.z
      )
    )
    .toBeGreaterThan(before.height)
  expect(
    await page.evaluate(() => (globalThis as any).container.table.cue.aim.angle)
  ).toBeCloseTo(before.angle, 6)
  const button = await camera.boundingBox()
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      point(button!.x + button!.width / 2, button!.y + button!.height / 2),
    ],
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })
  await expect(camera).toHaveAttribute("data-camera-mode", "2d")
  const chrome = await page.evaluate(() => {
    const hud = document.querySelector(".tray-score-container")!
    const rect = hud.getBoundingClientRect()
    return {
      cameraInside: hud.contains(document.getElementById("camera")),
      chatInside: hud.contains(document.getElementById("matchChatToggle")),
      trayHidden:
        getComputedStyle(document.getElementById("ballTray")!).display ===
        "none",
      opacity: getComputedStyle(hud).backgroundColor,
      chatBottom: document
        .getElementById("matchChatToggle")!
        .getBoundingClientRect().bottom,
      hudBottom: rect.bottom,
    }
  })
  expect(chrome.cameraInside && chrome.chatInside && chrome.trayHidden).toBe(
    true
  )
  expect(chrome.chatBottom).toBeLessThanOrEqual(chrome.hudBottom)
  expect(chrome.opacity).toBe("rgba(8, 20, 32, 0.18)")
  await page.evaluate(() => (globalThis as any).container.hud.updateBreak(3))
  const runRect = await page.locator("#breakScore").boundingBox()
  expect(runRect!.y + runRect!.height).toBeLessThanOrEqual(chrome.hudBottom)
  await page.screenshot({
    path: "docs/qa/2026-09-05-aim-return/landscape.png",
  })
  const rail = await page.locator("#powerSliderContainer").boundingBox()
  for (let shot = 0; shot < 2; shot++) {
    await expect(page.locator("#cuePower")).toBeEnabled()
    await expect(page.locator("#cuePower")).toHaveValue("0")
    // Inspect freely before every strike; the following Aim must recover a
    // comfortable shot view without another manual camera gesture.
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point(380, 210), { ...point(500, 210), id: 2 }],
    })
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(360, 230), { ...point(520, 230), id: 2 }],
    })
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })
    expect(
      await page.evaluate(() => {
        const camera = (globalThis as any).container.view.camera
        return camera.mode === camera.freeView
      })
    ).toBe(true)
    const x = rail!.x + rail!.width / 2
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point(x, rail!.y + 8)],
    })
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      // Reach the rack with the gentler input curve; this tests consecutive
      // turns, while gentle-power.spec.ts covers short-range shots.
      touchPoints: [point(x, rail!.y + rail!.height * 0.57)],
    })
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    })
    await expect
      .poll(() =>
        page.evaluate(() => (globalThis as any).container.manualShotCount)
      )
      .toBe(shot + 1)
    await expect(page.locator("#cuePower")).toHaveValue("0")
    await expect(page.locator("#cuePowerValue")).toHaveText("0")
    await expect(page.locator("#panel")).toHaveAttribute(
      "data-controls-state",
      "ready",
      { timeout: 25000 }
    )
    await expect(page.locator("#cuePowerValue")).toHaveText("0")
    await expect
      .poll(() =>
        page.evaluate(() => {
          const game = (globalThis as any).container
          return (
            game.controller.name === "Aim" &&
            game.view.camera.mode === game.view.camera.aimView
          )
        })
      )
      .toBe(true)
    await expect(page.locator("#ballTray")).not.toBeVisible()
  }
  await page.locator("#matchHistory summary").click()
  await expect(page.locator("#ballTray")).toBeVisible()
  await page.locator("#matchHistory summary").click()
  await expect(page.locator("#ballTray")).not.toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const game = (globalThis as any).container
        const camera = game.view.camera
        return camera.camera.position.distanceTo(
          game.view.robotPlayers.cameraFrame.eye
        )
      })
    )
    .toBeLessThan(0.02)
  await page.screenshot({
    path: "docs/qa/2026-09-05-aim-return/after-shots.png",
  })
  await expect(page.locator("#openElevation")).not.toBeVisible()
  await page.locator("#gameOverflowToggle").click()
  await page.locator("#openElevation").click()
  await expect(page.locator("#tiltSliderContainer")).toBeVisible()
  await page.locator("#elevationUp").click()
  await expect(page.locator("#elevationValue")).toHaveText("1°")
  await context.close()
})

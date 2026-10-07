import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("fine touch aim stays crouched and the selected cue travels with its player", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const context = await browser.newContext({
    viewport: { width: 915, height: 412 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem("break-builder.controls-seen.v2", "acknowledged"),
  );
  await page.goto(
    "/?play=1&platformDemo=1&ruletype=eightball&practice=true&quality=high&camera=3d&environment=club",
  );
  await page.waitForFunction(
    () => (globalThis as any).container?.view.robotPlayers,
  );
  await page.locator("#cueHit").click();
  if (await page.locator("#gameSocialClose").isVisible())
    await page.locator("#gameSocialClose").click();
  await page.waitForFunction(() => {
    const game = (globalThis as any).container;
    return (
      game.view.robotPlayers.players[0].stance < 0.001 &&
      game.view.camera.camera.position.distanceTo(
        game.view.robotPlayers.cameraFrame.eye,
      ) < 0.001
    );
  });
  const beforeAngle = await page.evaluate(
    () => (globalThis as any).container.table.cue.aim.angle,
  );
  const cdp = await context.newCDPSession(page);
  const points = (x: number) => [{ id: 1, x, y: 210, radiusX: 6, radiusY: 6 }];
  const samples: {
    walking: boolean;
    height: number;
    firstPerson: boolean;
    angle: number;
  }[] = [];
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points(430),
  });
  for (let i = 0; i < 70; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: points(430 + Math.sin(i * 0.25) * 16),
    });
    samples.push(
      await page.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        const game = (globalThis as any).container;
        return {
          walking: game.view.robotPlayers.cameraFrame.walking,
          height: game.view.camera.camera.position.z,
          firstPerson:
            game.view.robotPlayers.players[0].root.userData.firstPerson,
          angle: game.table.cue.aim.angle,
        };
      }),
    );
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(
    samples.some((sample) => Math.abs(sample.angle - beforeAngle) > 0.01),
  ).toBe(true);
  expect(samples.every((sample) => !sample.walking && sample.firstPerson)).toBe(
    true,
  );
  const heightSpan =
    Math.max(...samples.map((sample) => sample.height)) -
    Math.min(...samples.map((sample) => sample.height));
  expect(heightSpan).toBeLessThan(0.005);
  await page.screenshot({ path: "docs/qa/2026-09-06-stable-aim/aim.png" });
  await page.evaluate(() => {
    const game = (globalThis as any).container;
    game.table.cue.setStyle("aurora-prism", false);
    game.table.cueball.pos.set(0.7, 0, game.table.cueball.pos.z);
    game.table.cue.aim.pos.copy(game.table.cueball.pos);
    game.table.cue.aim.angle = Math.PI;
    game.view.camera.beginAimTurn(true);
  });
  await page.waitForFunction(() => {
    const game = (globalThis as any).container;
    return (
      game.view.robotPlayers.cameraFrame.walking &&
      game.view.robotPlayers.players[0].carriedCue.visible &&
      game.view.camera.camera.position.distanceTo(game.view.camera.target) < 0.6
    );
  });
  const carrying = await page.evaluate(() => {
    const game = (globalThis as any).container;
    const held = game.view.robotPlayers.players[0].carriedCue;
    return {
      style: held.userData.cueStyleId,
      visible: held.visible,
      tableCue: game.table.cue.cueBody.visible,
    };
  });
  expect(carrying).toEqual({
    style: "aurora-prism",
    visible: true,
    tableCue: false,
  });
  await page.screenshot({
    path: "docs/qa/2026-09-06-stable-aim/carry-prism.png",
  });
  await page.evaluate(() =>
    (globalThis as any).container.table.cue.setStyle("holo-laser", false),
  );
  await page.waitForFunction(
    () =>
      (globalThis as any).container.view.robotPlayers.players[0].carriedCue
        .userData.cueStyleId === "holo-laser",
  );
  await page.screenshot({
    path: "docs/qa/2026-09-06-stable-aim/carry-laser.png",
  });
  await page.waitForFunction(() => {
    const game = (globalThis as any).container;
    return (
      !game.view.robotPlayers.cameraFrame.walking &&
      game.view.robotPlayers.players[0].stance < 0.01
    );
  });
  expect(
    await page.evaluate(
      () => (globalThis as any).container.table.cue.cueBody.visible,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        (globalThis as any).container.view.robotPlayers.players[0].carriedCue
          .visible,
    ),
  ).toBe(false);
  await writeFile(
    "docs/qa/2026-09-06-stable-aim/browser-evidence.json",
    JSON.stringify({ heightSpan, carrying, samples, errors }, null, 2),
  );
  expect(errors).toEqual([]);
  await context.close();
});

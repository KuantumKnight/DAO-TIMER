import { test, expect, type Page } from "@playwright/test";
import { initialEvent, type EventState } from "../../lib/clock";

async function localClock(page: Page, getEvent: () => EventState = initialEvent) {
  await page.route("**/api/event", route => route.fulfill({ json: getEvent() }));
  await page.route("**/api/time", route => route.fulfill({ json: { serverTime: Date.now() } }));
}
async function settings(page: Page) {
  await page.getByRole("button", { name: "Display settings", exact: true }).last().click();
}

test("music starts explicitly, loops, survives closing settings and fullscreen, and remembers volume", async ({ page }) => {
  const event = initialEvent();
  event.clock.startAt = Date.now() - 3600_000;
  event.clock.endAt = Date.now() + 3600_000;
  await localClock(page, () => event);
  let mediaRequests = 0;
  page.on("request", request => { if (request.url().includes("/audio/formula-1.mp3")) mediaRequests++; });
  await page.goto("/");
  await expect(page.getByRole("timer")).not.toHaveAttribute("aria-label", "Loading timer");
  expect(mediaRequests).toBe(0);
  expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true);
  await settings(page);
  await expect(page.getByLabel("Volume", { exact: true })).toHaveValue("35");
  await page.getByRole("button", { name: "Play music", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThan(0.2);
  await page.getByLabel("Volume", { exact: true }).fill("62");
  expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.volume)).toBe(0.62);
  await page.getByRole("button", { name: "Pause music", exact: true }).click();
  const position = await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime);
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true);
  await page.getByRole("button", { name: "Play music", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThan(position);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "Toggle fullscreen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.duration)).toBeGreaterThan(1);
  await page.locator("audio").evaluate((audio: HTMLAudioElement) => { audio.currentTime = audio.duration - 0.15; });
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime), { timeout: 10_000 }).toBeLessThan(3);
  expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
  event.clock.pausedAt = Date.now(); event.revision++;
  await expect(page.getByRole("heading", { name: "Clock paused", exact: true })).toBeVisible();
  expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
  event.clock.pausedAt = null; event.clock.endedAt = Date.now(); event.revision++;
  await expect(page.getByRole("heading", { name: "Time’s up", exact: true })).toBeVisible();
  expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
  await page.reload();
  await settings(page);
  await expect(page.getByLabel("Volume", { exact: true })).toHaveValue("62");
  await expect(page.getByRole("button", { name: "Play music", exact: true })).toBeVisible();
  expect(await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true);
});

test("music settings fit a phone and projector settings while the timer stays clean", async ({ page }) => {
  await localClock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await settings(page);
  await expect(page.getByRole("button", { name: "Play music", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.getByRole("dialog").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/music-settings-phone.png" });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/display");
  await expect(page.locator(".display-controls")).toBeHidden();
  await page.keyboard.press("s");
  await expect(page.getByRole("button", { name: "Play music", exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/music-settings-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("failed audio loading shows an inline error and allows retry", async ({ page }) => {
  await localClock(page);
  await page.route("**/audio/formula-1.mp3", route => route.abort());
  await page.goto("/");
  await settings(page);
  await page.getByRole("button", { name: "Play music", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Music could not");
  await expect(page.getByRole("button", { name: "Play music", exact: true })).toBeVisible();
  await page.unroute("**/audio/formula-1.mp3");
  await page.getByRole("button", { name: "Play music", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThan(0.1);
  await expect(page.getByRole("alert")).toBeHidden();
});

test("a browser playback refusal gives a useful error without affecting timer settings", async ({ page }) => {
  await localClock(page);
  await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException("Blocked", "NotAllowedError")); });
  await page.goto("/");
  await settings(page);
  await page.getByRole("button", { name: "Play music", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Your browser blocked playback");
  await expect(page.getByRole("button", { name: "Play music", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show event progress" })).toBeEnabled();
});

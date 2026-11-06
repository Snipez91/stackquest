import { expect, test, type Page } from "@playwright/test";

/**
 * Two independent browser sessions (separate cookie jars):
 * admin creates a team and an invite; a second user joins via the link;
 * chat messages arrive live in the other session; a send that fails while
 * offline can be retried without creating a duplicate.
 */

const stamp = Date.now().toString(36);

async function signUp(page: Page, name: string, email: string, invite?: string) {
  await page.goto(invite ? `/sign-up?invite=${invite}` : "/sign-up");
  await page.getByLabel("Display name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
}

test("invite, join, live chat and retry without duplicates", async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pa = await a.newPage();
  const pb = await b.newPage();

  // Admin: sign up and create a team.
  await signUp(pa, `Ava ${stamp}`, `ava-${stamp}@example.test`);
  await pa.waitForURL("**/welcome");
  await pa.getByLabel("Team name").fill(`E2E Team ${stamp}`);
  await pa.getByRole("button", { name: "Create team" }).click();
  await pa.waitForURL("**/onboarding");

  // Admin: create an invitation link.
  await pa.goto("/admin");
  await pa.getByRole("button", { name: "Create invitation link" }).click();
  const link = await pa.getByLabel("Invitation link").inputValue();
  expect(link).toMatch(/\/invite\/[\w-]{30,}/);
  const token = link.split("/invite/")[1];

  // Second user: opens the link, sees the team, signs up and joins.
  await pb.goto(`/invite/${token}`);
  await expect(pb.getByRole("heading", { name: `Join E2E Team ${stamp}` })).toBeVisible();
  await pb.getByRole("link", { name: "Create an account and join" }).click();
  await pb.getByLabel("Display name").fill(`Ben ${stamp}`);
  await pb.getByLabel("Email").fill(`ben-${stamp}@example.test`);
  await pb.getByLabel("Password").fill("e2e correct horse battery");
  await pb.getByRole("button", { name: "Create account" }).click();
  await pb.waitForURL("**/onboarding?joined=1");

  // The used invite now shows as used up for anyone else.
  const c = await browser.newContext();
  const pc = await c.newPage();
  await pc.goto(`/invite/${token}`);
  await expect(pc.getByRole("heading", { name: /already been used/ })).toBeVisible();
  await c.close();

  // Both open chat (#general is default).
  await pa.goto("/chat");
  await pb.goto("/chat");
  const composerA = pa.getByLabel("Message #general");
  const composerB = pb.getByLabel("Message #general");
  await expect(composerA).toBeEnabled();
  await expect(composerB).toBeEnabled();
  // Wait for both realtime streams to connect.
  await pa.waitForTimeout(1500);

  await composerA.fill(`hello from ava ${stamp}`);
  await composerA.press("Enter");
  await expect(pb.getByRole("log").getByText(`hello from ava ${stamp}`)).toBeVisible();

  await composerB.fill(`hi @ava${stamp.slice(0, 4)} ||spoiler text||`);
  await composerB.press("Enter");
  await expect(pa.getByRole("log").getByText(`hi @`)).toBeVisible();
  await expect(pa.getByRole("button", { name: /Spoiler hidden/ })).toBeVisible();

  // Offline send fails visibly, retry succeeds, and the other session sees it exactly once.
  await b.setOffline(true);
  await composerB.fill(`sent while offline ${stamp}`);
  await composerB.press("Enter");
  await expect(pb.getByText(/Not sent/)).toBeVisible();
  await b.setOffline(false);
  await pb.getByRole("button", { name: "Retry" }).first().click();
  await expect(pa.getByRole("log").getByText(`sent while offline ${stamp}`)).toHaveCount(1);
  await pa.reload();
  await expect(pa.getByRole("log").getByText(`sent while offline ${stamp}`)).toHaveCount(1);

  // Team page lists both members.
  await pb.goto("/team");
  await expect(pb.getByRole("table", { name: /leaderboard/i }).getByText(`Ava ${stamp}`)).toBeVisible();
  await expect(pb.getByRole("table", { name: /leaderboard/i }).getByText(`Ben ${stamp}`)).toBeVisible();

  await a.close();
  await b.close();
});

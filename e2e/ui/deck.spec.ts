import { test, expect, topCard } from "../support/test";
import nearby3 from "../fixtures/nearby-3.json";
import empty from "../fixtures/nearby-empty.json";

const [first, second, third] = nearby3.cards.map((c) => c.name);

test.describe("swipe deck", () => {
  test("shows the first restaurant from the API", async ({ page, mockApi }) => {
    await mockApi();
    await page.goto("/");

    await expect(topCard(page)).toHaveAccessibleName(new RegExp(`^${first}\\.`));
    await expect(page.getByText("Samyan", { exact: true })).toBeVisible(); // label from /reverse
    await expect(page.getByRole("button", { name: "Like" })).toBeEnabled();
  });

  test("Like and Pass buttons advance to the next card", async ({ page, mockApi }) => {
    await mockApi();
    await page.goto("/");
    await expect(topCard(page)).toHaveAccessibleName(new RegExp(`^${first}\\.`));

    await page.getByRole("button", { name: "Pass" }).click();
    await expect(topCard(page)).toHaveAccessibleName(new RegExp(`^${second}\\.`));

    await page.getByRole("button", { name: "Like" }).click();
    await expect(topCard(page)).toHaveAccessibleName(new RegExp(`^${third}\\.`));
    // Only the like counts toward the saved list.
    await expect(page.getByTestId("liked-pill")).toHaveText(/See your 1 liked places/);
  });

  test("dragging the card right likes it", async ({ page, mockApi }) => {
    await mockApi();
    await page.goto("/");
    const card = topCard(page);
    await expect(card).toHaveAccessibleName(new RegExp(`^${first}\\.`));

    // The app commits a swipe once the card travels > 28% of the window width.
    const box = (await card.boundingBox())!;
    const { width } = page.viewportSize()!;
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + width * 0.4, startY, { steps: 12 });
    await page.mouse.up();

    await expect(topCard(page)).toHaveAccessibleName(new RegExp(`^${second}\\.`));
    await expect(page.getByTestId("liked-pill")).toHaveText(/See your 1 liked places/);
  });

  test("liked places show in the saved list and survive a reload", async ({ page, mockApi }) => {
    await mockApi();
    await page.goto("/");
    await expect(topCard(page)).toHaveAccessibleName(new RegExp(`^${first}\\.`));
    await page.getByRole("button", { name: "Like" }).click();

    await page.getByTestId("liked-pill").click();
    const saved = page.getByTestId("liked-sheet").getByTestId("liked-item");
    await expect(saved).toHaveCount(1);
    await expect(saved).toContainText(first);

    await page.reload();

    // An already-liked place is kept out of the deck after a reload...
    await expect(topCard(page)).toHaveAccessibleName(new RegExp(`^${second}\\.`));
    // ...and is still in the saved list, read back from localStorage.
    await page.getByTestId("liked-pill").click();
    await expect(saved).toHaveCount(1);
    await expect(saved).toContainText(first);
  });
});

test.describe("deck states", () => {
  test("shows an empty state when there are no restaurants", async ({ page, mockApi }) => {
    await mockApi({ nearby: { json: empty } });
    await page.goto("/");

    await expect(page.getByTestId("deck-message")).toContainText("Nothing here with those filters");
    await expect(topCard(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Like" })).toHaveCount(0);
  });

  const errors = [
    {
      name: "server error (500)",
      status: 500,
      json: { error: "Places is unavailable right now" },
      message: "Places is unavailable right now",
    },
    {
      name: "rate limited (429)",
      status: 429,
      json: { error: "slow down — too many requests" },
      message: "Too many requests just now — wait a minute and try again.",
    },
  ];

  for (const { name, status, json, message } of errors) {
    test(`shows an error for a ${name} and recovers on retry`, async ({ page, mockApi }) => {
      await mockApi({ nearby: { status, json } });
      await page.goto("/");

      await expect(page.getByTestId("deck-message")).toContainText(message);
      await expect(topCard(page)).toHaveCount(0);

      // The proxy is healthy again. Routes registered later take precedence,
      // so this default mock now answers /nearby.
      await mockApi();
      await page.getByRole("button", { name: "Try again" }).click();

      await expect(topCard(page)).toHaveAccessibleName(new RegExp(`^${first}\\.`));
      await expect(page.getByTestId("deck-message")).toHaveCount(0);
    });
  }
});

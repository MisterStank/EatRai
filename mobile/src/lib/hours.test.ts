import { todayHours, isTodayLine } from "./hours";

// 2024-01-07 was a Sunday; day 0 = Sunday, matching Date.getDay().
function setToday(dayOfWeek: number) {
  jest.useFakeTimers().setSystemTime(new Date(2024, 0, 7 + dayOfWeek));
}
afterEach(() => {
  jest.useRealTimers();
});

describe("todayHours", () => {
  test("finds the line matching today's day name", () => {
    setToday(1); // Monday
    const lines = ["Sunday: Closed", "Monday: 9 AM – 10 PM", "Tuesday: 9 AM – 10 PM"];
    expect(todayHours(lines, "en")).toBe("Monday: 9 AM – 10 PM");
  });

  test("falls back to the first line if no day matches", () => {
    setToday(1);
    expect(todayHours(["Some unrelated text"], "en")).toBe("Some unrelated text");
  });

  test("returns empty string for missing/empty input", () => {
    expect(todayHours(undefined, "en")).toBe("");
    expect(todayHours([], "en")).toBe("");
  });

  test("matches Thai day names embedded in a longer label", () => {
    setToday(1); // Monday -> "จันทร์"
    const lines = ["วันจันทร์: 09:00–22:00", "วันอังคาร: 09:00–22:00"];
    expect(todayHours(lines, "th")).toBe("วันจันทร์: 09:00–22:00");
  });
});

describe("isTodayLine", () => {
  test("true when the line contains today's day name", () => {
    setToday(3); // Wednesday
    expect(isTodayLine("Wednesday: 9 AM – 10 PM", "en")).toBe(true);
    expect(isTodayLine("Thursday: 9 AM – 10 PM", "en")).toBe(false);
  });
});

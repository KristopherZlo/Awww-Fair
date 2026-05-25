import { describe, expect, it } from "vitest";
import { formatCandidateRequirement, formatLogForViewer, formatPersonalityChoice, isFocusTrendLine, ownerPhrase } from "./presentation";

describe("presentation formatting", () => {
  it("formats Russian sale text without mojibake", () => {
    expect(ownerPhrase("A", "A", "ru")).toBe("у вас");
    expect(ownerPhrase("B", "A", "ru")).toBe("у оппонента");
    expect(formatLogForViewer("Студент: Хлеб {{owner:A}}", "A", "ru")).toBe("Студент: Хлеб у вас");
    expect(formatCandidateRequirement({ kind: "trend_score", actual: 1, required: 2, passed: false }, "ru")).toBe(
      "характер: трендовый бонус 1 / 2 - не подходит"
    );
    expect(
      formatPersonalityChoice(
        {
          kind: "second_best",
          applied: true,
          appealGap: 1,
          maxAppealGap: 1,
          firstChoice: { ownerId: "A", slotIndex: 0, productInstanceId: "bread-1" },
          secondChoice: { ownerId: "B", slotIndex: 0, productInstanceId: "coffee-1" }
        },
        "ru"
      )
    ).toBe("характер: куплен товар со вторым результатом, разница 1 / 1");
    expect(isFocusTrendLine("Сладкий день: сладкое (главный тренд)")).toBe(true);
  });
});

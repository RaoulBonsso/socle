import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TexteCode } from "./texte-code";

describe("TexteCode", () => {
  it("met en forme le code en ligne et laisse le HTML en texte", () => {
    const { container } = render(<TexteCode texte={"Entre `EXPLAIN` et <b>x</b>"} />);
    expect(container.querySelector("code")?.textContent).toBe("EXPLAIN");
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<b>x</b>");
  });
});

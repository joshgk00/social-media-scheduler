import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";

const APP_THEME_COLOR_CSS = `
  @theme {
    --color-success: oklch(0.696 0.17 142.495);
    --color-warning: oklch(0.852 0.199 91.936);
  }
  @tailwind utilities;
`;

async function compileThemeUtilities(candidates: string[]): Promise<string> {
  const compiler = await compile(APP_THEME_COLOR_CSS, { from: undefined });
  return compiler.build(candidates);
}

function computedBackgroundColorFor(
  compiledCss: string,
  className: string,
): string {
  const style = document.createElement("style");
  const sample = document.createElement("div");
  style.textContent = compiledCss;
  document.head.appendChild(style);
  sample.className = className;
  document.body.appendChild(sample);

  try {
    return window.getComputedStyle(sample).backgroundColor;
  } finally {
    sample.remove();
    style.remove();
  }
}

describe("Tailwind theme color utilities", () => {
  it("emits non-transparent success and warning background colors", async () => {
    const compiledCss = await compileThemeUtilities([
      "bg-success",
      "bg-warning",
    ]);

    expect(compiledCss).toContain("background-color: var(--color-success)");
    expect(compiledCss).toContain("background-color: var(--color-warning)");
    expect(computedBackgroundColorFor(compiledCss, "bg-success")).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(computedBackgroundColorFor(compiledCss, "bg-warning")).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
  });

  it("emits valid token utilities for success and warning text/border variants", async () => {
    const compiledCss = await compileThemeUtilities([
      "text-success",
      "text-success/70",
      "text-warning",
      "border-success/30",
    ]);

    expect(compiledCss).toContain("color: var(--color-success)");
    expect(compiledCss).toContain("color: var(--color-warning)");
    expect(compiledCss).toContain("var(--color-success) 70%");
    expect(compiledCss).toContain("var(--color-success) 30%");
  });
});

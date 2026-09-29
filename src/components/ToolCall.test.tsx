/**
 * Tests for ToolCall map embedding.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ToolCall, { getEmbeddedMapHash } from "./ToolCall";

function mapCall(toolName: string, shortHash: string | null, success = true) {
  return {
    tool_id: `${toolName}-1`,
    tool_name: toolName,
    success,
    response: JSON.stringify({
      message: "ok",
      status: "success",
      data: { map_id: shortHash ? 7 : null, short_hash: shortHash, title: "Potholes" },
    }),
  };
}

describe("getEmbeddedMapHash", () => {
  it("returns the hash for a successful generate_map", () => {
    expect(getEmbeddedMapHash(mapCall("generate_map", "abc123"))).toBe("abc123");
  });

  it("returns the hash for show_map", () => {
    expect(getEmbeddedMapHash(mapCall("show_map", "abc123"))).toBe("abc123");
  });

  it("returns null for an unsaved preview map", () => {
    expect(getEmbeddedMapHash(mapCall("generate_map", null))).toBeNull();
  });

  it("returns null for a failed call", () => {
    expect(getEmbeddedMapHash(mapCall("generate_map", "abc123", false))).toBeNull();
  });

  it("returns null for non-map tools", () => {
    expect(getEmbeddedMapHash(mapCall("set_dataset", "abc123"))).toBeNull();
  });
});

describe("ToolCall map embed", () => {
  it("embeds a successful generate_map expanded", () => {
    const { container } = render(<ToolCall toolCall={mapCall("generate_map", "abc123")} />);
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toContain("/m/abc123");
  });

  it("renders only the chip when hideEmbed is set", () => {
    const { container } = render(
      <ToolCall toolCall={mapCall("show_map", "abc123")} hideEmbed />
    );
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("renders only the chip for an unsaved preview map", () => {
    const { container } = render(<ToolCall toolCall={mapCall("generate_map", null)} />);
    expect(container.querySelector("iframe")).toBeNull();
  });
});

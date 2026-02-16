import { render, screen } from "@testing-library/react";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders button label", () => {
    render(<Button>Run Analysis</Button>);

    expect(
      screen.getByRole("button", { name: "Run Analysis" })
    ).toBeInTheDocument();
  });

  it("applies variant class for destructive button", () => {
    render(<Button variant="destructive">Delete</Button>);

    expect(screen.getByRole("button", { name: "Delete" }).className).toContain(
      "bg-red-500"
    );
  });
});

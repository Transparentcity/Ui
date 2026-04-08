import { render, screen, fireEvent } from "@testing-library/react"
import { vi, describe, it, expect } from "vitest"

import SidebarRecentQuestions from "./SidebarRecentQuestions"

describe("SidebarRecentQuestions", () => {
  it("renders section header", () => {
    render(<SidebarRecentQuestions />)
    expect(screen.getByText("Recent Questions")).toBeInTheDocument()
  })

  it("renders 5 sample questions", () => {
    render(<SidebarRecentQuestions />)
    const buttons = screen.getAllByRole("button")
    expect(buttons).toHaveLength(5)
  })

  it("shows city-specific questions when city name is provided", () => {
    render(<SidebarRecentQuestions activeCityName="San Francisco" />)
    expect(
      screen.getByText("Which neighborhood in San Francisco is the safest?")
    ).toBeInTheDocument()
    expect(
      screen.getByText("What are the crime trends in San Francisco?")
    ).toBeInTheDocument()
  })

  it("shows generic questions when no city name is provided", () => {
    render(<SidebarRecentQuestions />)
    expect(
      screen.getByText("Which cities does Transparent City cover?")
    ).toBeInTheDocument()
    expect(
      screen.getByText("How does Transparent City get its data?")
    ).toBeInTheDocument()
  })

  it("shows generic questions when city name is null", () => {
    render(<SidebarRecentQuestions activeCityName={null} />)
    expect(
      screen.getByText("What can I learn about my neighborhood?")
    ).toBeInTheDocument()
  })

  it("shows generic questions when city name is empty string", () => {
    render(<SidebarRecentQuestions activeCityName="" />)
    expect(
      screen.getByText("How are safety scores calculated?")
    ).toBeInTheDocument()
  })

  it("calls onQuestionClick with question text", () => {
    const handleClick = vi.fn()
    render(
      <SidebarRecentQuestions
        activeCityName="Portland"
        onQuestionClick={handleClick}
      />
    )
    fireEvent.click(
      screen.getByText("Which neighborhood in Portland is the safest?")
    )
    expect(handleClick).toHaveBeenCalledWith(
      "Which neighborhood in Portland is the safest?"
    )
  })

  it("collapses and expands when header is clicked", () => {
    render(<SidebarRecentQuestions />)
    expect(screen.getAllByRole("button")).toHaveLength(5)

    fireEvent.click(screen.getByText("Recent Questions"))
    expect(screen.queryAllByRole("button")).toHaveLength(0)

    fireEvent.click(screen.getByText("Recent Questions"))
    expect(screen.getAllByRole("button")).toHaveLength(5)
  })
})

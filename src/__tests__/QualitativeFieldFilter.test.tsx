import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QualitativeFieldFilter } from "../components/QualitativeFieldFilter.js";

describe("QualitativeFieldFilter", () => {
  it("renders every option as a checkbox, checked state matching `selected`", () => {
    render(
      <QualitativeFieldFilter
        label="Categories"
        options={["work", "personal", "errands"]}
        selected={new Set(["personal"])}
        onToggle={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "work" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "personal" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "errands" })).not.toBeChecked();
  });

  it("shows the selected count in the summary label", () => {
    render(
      <QualitativeFieldFilter
        label="Categories"
        options={["work", "personal"]}
        selected={new Set(["work", "personal"])}
        onToggle={() => {}}
        onClear={() => {}}
      />,
    );
    expect(screen.getByText("Categories (2)")).toBeInTheDocument();
  });

  it("calls onToggle with the clicked option's value", () => {
    const onToggle = vi.fn();
    render(
      <QualitativeFieldFilter label="Categories" options={["work"]} selected={new Set()} onToggle={onToggle} onClear={() => {}} />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "work" }));
    expect(onToggle).toHaveBeenCalledWith("work");
  });

  it("only shows a Clear button once something is selected", () => {
    const { rerender } = render(
      <QualitativeFieldFilter label="Categories" options={["work"]} selected={new Set()} onToggle={() => {}} onClear={() => {}} />,
    );
    expect(screen.queryByText("Clear selection")).not.toBeInTheDocument();

    rerender(
      <QualitativeFieldFilter label="Categories" options={["work"]} selected={new Set(["work"])} onToggle={() => {}} onClear={() => {}} />,
    );
    expect(screen.getByText("Clear selection")).toBeInTheDocument();
  });
});

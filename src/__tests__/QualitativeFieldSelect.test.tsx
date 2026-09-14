import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QualitativeFieldSelect } from "../components/QualitativeFieldSelect.js";

describe("QualitativeFieldSelect", () => {
  it("renders every option plus a trailing create-new option", () => {
    render(<QualitativeFieldSelect value="work" options={["work", "personal"]} onChange={() => {}} onAddOption={async () => {}} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.textContent);
    expect(optionValues).toEqual(["work", "personal", "+ New..."]);
  });

  it("calls onChange when picking an existing option", () => {
    const onChange = vi.fn();
    render(<QualitativeFieldSelect value="work" options={["work", "personal"]} onChange={onChange} onAddOption={async () => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "personal" } });
    expect(onChange).toHaveBeenCalledWith("personal");
  });

  it("picking the create-new option swaps in a name input instead of calling onChange", () => {
    const onChange = vi.fn();
    render(<QualitativeFieldSelect value="work" options={["work"]} onChange={onChange} onAddOption={async () => {}} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__qualitative_field_new_value__" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("New value name")).toBeInTheDocument();
  });

  it("confirming a new value calls onAddOption then onChange with the trimmed name", async () => {
    const onAddOption = vi.fn().mockResolvedValue(undefined);
    const onChange = vi.fn();
    render(<QualitativeFieldSelect value="work" options={["work"]} onChange={onChange} onAddOption={onAddOption} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__qualitative_field_new_value__" } });
    fireEvent.change(screen.getByPlaceholderText("New value name"), { target: { value: "  side-project  " } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm new value" }));

    await waitFor(() => {
      expect(onAddOption).toHaveBeenCalledWith("side-project");
      expect(onChange).toHaveBeenCalledWith("side-project");
    });
  });

  it("shows an error and stays in create mode if onAddOption rejects", async () => {
    const onAddOption = vi.fn().mockRejectedValue(new Error("Category already exists"));
    render(<QualitativeFieldSelect value="work" options={["work"]} onChange={() => {}} onAddOption={onAddOption} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__qualitative_field_new_value__" } });
    fireEvent.change(screen.getByPlaceholderText("New value name"), { target: { value: "work" } });
    fireEvent.keyDown(screen.getByPlaceholderText("New value name"), { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Category already exists")).toBeInTheDocument();
    });
    // Still in create mode -- the input is still there, not reverted to the select.
    expect(screen.getByPlaceholderText("New value name")).toBeInTheDocument();
  });

  it("cancel button returns to the select without calling onAddOption", () => {
    const onAddOption = vi.fn();
    render(<QualitativeFieldSelect value="work" options={["work"]} onChange={() => {}} onAddOption={onAddOption} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "__qualitative_field_new_value__" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel new value" }));

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(onAddOption).not.toHaveBeenCalled();
  });
});

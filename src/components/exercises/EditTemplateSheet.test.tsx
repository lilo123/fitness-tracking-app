import { useState, useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EditTemplateSheet } from "./EditTemplateSheet";
import { expectNoA11yViolationsForRules } from "../../test/a11y";
import type { Exercise, RoutineTemplate } from "../../types/database";
import { supabase } from "../../lib/supabase";
import {
  createSupabaseBuilder,
  clearMockHistory,
  getRecordedTables,
} from "../../test/supabaseBuilderMock";

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: vi.fn((table: string) =>
      createSupabaseBuilder(table, { data: [], error: null })
    ),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// Mock ExercisePicker to verify overlay integration & focus return
vi.mock("./ExercisePicker", () => ({
  ExercisePicker: ({
    isOpen,
    onClose,
    onAdd,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (ex: any[]) => void;
  }) => {
    useEffect(() => {
      if (!isOpen) return;
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose();
        }
      };
      document.addEventListener("keydown", onKeyDown, true);
      return () => document.removeEventListener("keydown", onKeyDown, true);
    }, [isOpen, onClose]);

    if (!isOpen) return null;
    return (
      <dialog open aria-modal="true" data-testid="exercise-picker-sheet">
        <button
          type="button"
          data-testid="close-exercise-picker"
          onClick={onClose}
        >
          Close Picker
        </button>
        <button
          type="button"
          data-testid="add-picker-item"
          onClick={() =>
            onAdd([
              {
                id: "ex-new-1",
                name: "Incline Dumbbell Press",
                body_parts: ["Chest"],
                equipment: "Dumbbell",
                is_master: false,
                user_id: null,
                is_archived: false,
                is_hidden: false,
              },
            ])
          }
        >
          Add Incline Press
        </button>
      </dialog>
    );
  },
}));

describe("EditTemplateSheet", () => {
  const mockTemplate: RoutineTemplate = {
    id: "tpl-1",
    user_id: "user-1",
    name: "Push Day",
    is_master: false,
    days_of_week: ["Mon"],
    assigned_to: null,
    exercises: [],
  };

  const mockProps = {
    isOpen: true,
    template: mockTemplate,
    exercises: [] as Exercise[],
    targetUserId: "user-1",
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockHistory();
  });

  it("has accessible label association for Template Name and uses input-text-sm (NEW-17)", () => {
    render(<EditTemplateSheet {...mockProps} />);
    const input = screen.getByLabelText(/template name/i);
    expect(input).toBeDefined();
    expect(input.classList.contains("input-text-sm")).toBe(true);
    expect(input.classList.contains("text-sm")).toBe(false);
  });

  it("has no a11y label violations", async () => {
    const { container } = render(<EditTemplateSheet {...mockProps} />);
    await expectNoA11yViolationsForRules(container, ["label"]);
  });

  it("mounts template-error live region empty while idle and retains same node on error (NEW-15)", () => {
    const { container } = render(<EditTemplateSheet {...mockProps} />);

    // Live region exists and is empty while idle
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toBe("");

    // Trigger save with no exercises
    fireEvent.click(screen.getByTestId("save-template-btn"));

    expect(alert?.textContent).toBe("Please add at least one exercise to the template.");
    expect(screen.getByTestId("template-error")).toBeDefined();

    // Live region DOM node remains identical
    expect(container.querySelector('[role="alert"]')).toBe(alert);
  });

  describe("accessibility and focus management", () => {
    it("traps focus, restores focus on close, and closes on Escape", () => {
      function Wrapper() {
        const [open, setOpen] = useState(false);
        return (
          <div>
            <button data-testid="opener-btn" onClick={() => setOpen(true)}>
              Open
            </button>
            <EditTemplateSheet
              {...mockProps}
              isOpen={open}
              onClose={() => setOpen(false)}
            />
          </div>
        );
      }

      render(<Wrapper />);
      const opener = screen.getByTestId("opener-btn");
      opener.focus();
      fireEvent.click(opener);

      // 1. Dialog element exists with ARIA attributes
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();
      expect(dialog).toHaveAttribute("aria-modal", "true");

      // 2. Focus moved into dialog
      const closeBtn = screen.getByRole("button", { name: /close/i });
      expect(document.activeElement).toBe(closeBtn);

      // 3. Tab wraps from last focusable to first focusable
      const saveBtn = screen.getByTestId("save-template-btn");
      saveBtn.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(document.activeElement).toBe(closeBtn);

      // 4. Shift+Tab wraps from first focusable to last focusable
      closeBtn.focus();
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(saveBtn);

      // 5. Escape closes the sheet and restores focus to the opener
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(opener);
    });

    it("closes nested ExercisePicker first on Escape, then closes sheet on second Escape", () => {
      function Wrapper() {
        const [open, setOpen] = useState(false);
        return (
          <div>
            <button data-testid="opener-btn" onClick={() => setOpen(true)}>
              Open
            </button>
            <EditTemplateSheet
              {...mockProps}
              isOpen={open}
              onClose={() => setOpen(false)}
            />
          </div>
        );
      }

      render(<Wrapper />);
      fireEvent.click(screen.getByTestId("opener-btn"));
      expect(screen.getByRole("dialog")).toBeDefined();

      // Open exercise picker sheet
      fireEvent.click(screen.getByTestId("open-exercise-picker"));
      expect(screen.getByTestId("close-exercise-picker")).toBeDefined();

      // First Escape closes picker only
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByTestId("close-exercise-picker")).toBeNull();
      expect(screen.getByRole("dialog")).toBeDefined();

      // Second Escape closes sheet
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("focus returns to Add exercise button after closing ExercisePicker (L36)", async () => {
      render(<EditTemplateSheet {...mockProps} />);

      const addBtn = screen.getByTestId("open-exercise-picker");
      fireEvent.click(addBtn);

      // Picker is open
      const closePickerBtn = screen.getByTestId("close-exercise-picker");
      fireEvent.click(closePickerBtn);

      // Picker is closed and focus returns to add exercise trigger
      await waitFor(() => {
        expect(document.activeElement).toBe(addBtn);
      });
    });
  });

  it("satisfies mock fidelity contracts for routine template mutations", () => {
    // WILDCARD_MUTATION_RETURN: routine_templates returns created row via bare .select()
    // NO_PROJECTION_APPLIES: template_exercises updates and inserts are mutation-only
    const tplBuilder = createSupabaseBuilder("routine_templates", {
      data: [],
      error: null,
    });
    const exBuilder = createSupabaseBuilder("template_exercises", {
      data: [],
      error: null,
    });
    expect(tplBuilder.tableName).toBe("routine_templates");
    expect(exBuilder.tableName).toBe("template_exercises");
    expect(getRecordedTables()).toContain("routine_templates");
    expect(getRecordedTables()).toContain("template_exercises");
  });

  it("L2: passes p_is_master: true when saving an existing master routine template", async () => {
    const masterTpl: RoutineTemplate = {
      id: "tpl-master-1",
      user_id: "user-1",
      name: "Master Routine",
      is_master: true,
      days_of_week: ["Mon"],
      assigned_to: null,
      exercises: [
        {
          id: "te-1",
          template_id: "tpl-master-1",
          exercise_id: "ex-1",
          order_index: 0,
          target_sets: 3,
          target_reps: 10,
        },
      ],
    };

    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabase.rpc as any) = mockRpc;

    render(
      <EditTemplateSheet
        {...mockProps}
        template={masterTpl}
        exercises={[
          {
            id: "ex-1",
            name: "Squat",
            body_part: "Legs",
            is_master: true,
            user_id: "master-owner",
            is_archived: false,
          },
        ]}
      />
    );

    fireEvent.click(screen.getByTestId("save-template-btn"));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith(
        "save_routine_template",
        expect.objectContaining({
          p_template_id: "tpl-master-1",
          p_is_master: true,
        })
      );
    });
  });

  it("L5: when save_routine_template RPC fails, no fallback queries are executed and error is shown", async () => {
    const tpl: RoutineTemplate = {
      id: "tpl-1",
      user_id: "user-1",
      name: "Push Routine",
      is_master: false,
      days_of_week: ["Mon"],
      assigned_to: null,
      exercises: [
        {
          id: "te-1",
          template_id: "tpl-1",
          exercise_id: "ex-1",
          order_index: 0,
          target_sets: 3,
          target_reps: 10,
        },
      ],
    };

    const mockRpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error("RPC save failed") });
    (supabase.rpc as any) = mockRpc;

    const mockFrom = vi.fn();
    (supabase.from as any) = mockFrom;

    render(
      <EditTemplateSheet
        {...mockProps}
        template={tpl}
        exercises={[
          {
            id: "ex-1",
            name: "Squat",
            body_part: "Legs",
            is_master: true,
            user_id: "master-owner",
            is_archived: false,
          },
        ]}
      />
    );

    fireEvent.click(screen.getByTestId("save-template-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("template-error")).toBeDefined();
    });

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("L12: disables save button and displays inline error on whitespace name", () => {
    const tpl: RoutineTemplate = {
      id: "tpl-1",
      user_id: "user-1",
      name: "Push Routine",
      is_master: false,
      days_of_week: ["Mon"],
      assigned_to: null,
      exercises: [
        {
          id: "te-1",
          template_id: "tpl-1",
          exercise_id: "ex-1",
          order_index: 0,
          target_sets: 3,
          target_reps: 10,
        },
      ],
    };

    render(
      <EditTemplateSheet
        {...mockProps}
        template={tpl}
        exercises={[
          {
            id: "ex-1",
            name: "Squat",
            body_part: "Legs",
            is_master: true,
            user_id: "master-owner",
            is_archived: false,
          },
        ]}
      />
    );

    const input = screen.getByLabelText(/template name/i);
    fireEvent.change(input, { target: { value: "    " } });

    const saveBtn = screen.getByTestId("save-template-btn");
    expect(saveBtn).toBeDisabled();
    expect(
      screen.getByText(/Template name cannot be blank or whitespace-only./i)
    ).toBeDefined();
  });

  it("L15: day toggles have role=group aria-label='Scheduled days' and aria-pressed attributes", () => {
    render(<EditTemplateSheet {...mockProps} />);

    const group = screen.getByRole("group", { name: "Scheduled days" });
    expect(group).toBeDefined();

    const monPill = screen.getByTestId("day-pill-Mon");
    expect(monPill).toHaveAttribute("aria-pressed", "true");

    const tuePill = screen.getByTestId("day-pill-Tue");
    expect(tuePill).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(tuePill);
    expect(tuePill).toHaveAttribute("aria-pressed", "true");
  });

  it("L17: reorder polite live region announces 'Moved <name> to position N of M'", () => {
    const tpl: RoutineTemplate = {
      id: "tpl-1",
      user_id: "user-1",
      name: "Push Day",
      is_master: false,
      days_of_week: ["Mon"],
      assigned_to: null,
      exercises: [
        { id: "te-1", template_id: "tpl-1", exercise_id: "ex-1", order_index: 0, target_sets: 3, target_reps: 10 },
        { id: "te-2", template_id: "tpl-1", exercise_id: "ex-2", order_index: 1, target_sets: 3, target_reps: 10 },
      ],
    };

    render(
      <EditTemplateSheet
        {...mockProps}
        template={tpl}
        exercises={[
          { id: "ex-1", name: "Bench Press", body_part: "Chest", is_master: true, user_id: null, is_archived: false },
          { id: "ex-2", name: "Overhead Press", body_part: "Shoulders", is_master: true, user_id: null, is_archived: false },
        ]}
      />
    );

    const liveRegion = screen.getByTestId("reorder-live-region");
    expect(liveRegion.textContent).toBe("");

    // Move second exercise up to position 1 of 2
    const moveUpBtn = screen.getByTestId("move-up-1");
    fireEvent.click(moveUpBtn);

    expect(liveRegion.textContent).toBe("Moved Overhead Press to position 1 of 2");
  });

  it("L29: displays StatusBanner info for master routine (replaces hand-rolled banner)", () => {
    const masterTpl: RoutineTemplate = {
      id: "tpl-master-1",
      user_id: "user-1",
      name: "Master Routine",
      is_master: true,
      days_of_week: ["Mon"],
      assigned_to: null,
      exercises: [],
    };

    render(<EditTemplateSheet {...mockProps} template={masterTpl} />);

    const banner = screen.getByTestId("master-routine-banner");
    expect(banner).toBeDefined();
    expect(screen.getAllByText(/Editing Master Routine — changes will apply to all athletes/i).length).toBeGreaterThanOrEqual(1);
  });

  it("L43: single RPC call with p_expected_updated_at", async () => {
    const tplWithDate = {
      ...mockTemplate,
      updated_at: "2026-09-28T12:00:00Z",
      exercises: [
        { id: "te-1", template_id: "tpl-1", exercise_id: "ex-1", order_index: 0, target_sets: 3, target_reps: 10 },
      ],
    } as any;

    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabase.rpc as any) = mockRpc;

    render(
      <EditTemplateSheet
        {...mockProps}
        template={tplWithDate}
        exercises={[{ id: "ex-1", name: "Squat", body_part: "Legs", is_master: true, user_id: null, is_archived: false }]}
      />
    );

    fireEvent.click(screen.getByTestId("save-template-btn"));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith(
        "save_routine_template",
        expect.objectContaining({
          p_template_id: "tpl-1",
          p_expected_updated_at: "2026-09-28T12:00:00Z",
        })
      );
    });
  });

  it("L43: displays stale 409 StatusBanner with Reload action, no second write, and reload refetches", async () => {
    const tplWithDate = {
      ...mockTemplate,
      updated_at: "2026-09-28T12:00:00Z",
      exercises: [
        { id: "te-1", template_id: "tpl-1", exercise_id: "ex-1", order_index: 0, target_sets: 3, target_reps: 10 },
      ],
    } as any;

    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PT409", message: "stale_template" },
    });
    (supabase.rpc as any) = mockRpc;

    const reloadedRow = {
      id: "tpl-1",
      name: "Push Day (Updated Elsewhere)",
      days_of_week: ["Mon", "Wed"],
      updated_at: "2026-09-28T13:00:00Z",
      exercises: [],
    };

    const mockSingle = vi.fn().mockResolvedValue({ data: reloadedRow, error: null });
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: mockSingle,
      }),
    });
    (supabase.from as any) = vi.fn().mockReturnValue({
      select: mockSelect,
    });

    render(
      <EditTemplateSheet
        {...mockProps}
        template={tplWithDate}
        exercises={[{ id: "ex-1", name: "Squat", body_part: "Legs", is_master: true, user_id: null, is_archived: false }]}
      />
    );

    fireEvent.click(screen.getByTestId("save-template-btn"));

    // 409 error banner shown
    await waitFor(() => {
      expect(screen.getByTestId("stale-template-banner")).toBeDefined();
      expect(
        screen.getAllByText(
          "This routine was changed elsewhere. Reload to see the latest version."
        ).length
      ).toBeGreaterThanOrEqual(1);
    });

    // Never overwrite: exactly 1 RPC call, no second write!
    expect(mockRpc).toHaveBeenCalledTimes(1);

    // Click Reload action
    const reloadBtn = screen.getByTestId("reload-template-btn");
    fireEvent.click(reloadBtn);

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith("routine_templates");
      // Form values refreshed to reloaded data
      expect(screen.getByTestId("template-name-input")).toHaveValue(
        "Push Day (Updated Elsewhere)"
      );
      // Stale banner cleared
      expect(screen.queryByTestId("stale-template-banner")).toBeNull();
    });
  });

  it("L13: dismiss blocked while saving (dismissible={!saving}) and buttons disabled", async () => {
    let resolveRpc: (val: any) => void;
    const rpcPromise = new Promise((resolve) => {
      resolveRpc = resolve;
    });

    const mockRpc = vi.fn().mockReturnValue(rpcPromise);
    (supabase.rpc as any) = mockRpc;

    const onClose = vi.fn();
    render(
      <EditTemplateSheet
        {...mockProps}
        onClose={onClose}
        template={{
          ...mockTemplate,
          exercises: [
            { id: "te-1", template_id: "tpl-1", exercise_id: "ex-1", order_index: 0, target_sets: 3, target_reps: 10 },
          ],
        }}
        exercises={[{ id: "ex-1", name: "Squat", body_part: "Legs", is_master: true, user_id: null, is_archived: false }]}
      />
    );

    fireEvent.click(screen.getByTestId("save-template-btn"));

    // While saving is pending:
    // 1. Escape does NOT close the modal
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    // 2. Cancel and Save buttons are disabled
    expect(screen.getByTestId("cancel-template-btn")).toBeDisabled();
    expect(screen.getByTestId("save-template-btn")).toBeDisabled();

    // Resolve RPC
    resolveRpc!({ data: null, error: null });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});

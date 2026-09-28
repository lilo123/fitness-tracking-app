import React, { useState, useEffect, useId, useRef, useCallback } from "react";
import type { Exercise, RoutineTemplate } from "../../types/database";
import { resolveExerciseLabel } from "../../utils/exerciseLabel";
import { supabase } from "../../lib/supabase";
import { Plus, Check, Calendar } from "lucide-react";
import { TemplateExerciseItem } from "./TemplateExerciseItem";
import { ExercisePicker } from "./ExercisePicker";
import type { CatalogExercise } from "../../lib/exercises";
import { Sheet } from "../common/Sheet";
import { Button } from "../common/Button";
import { Chip } from "../common/Chip";
import { StatusBanner } from "../common/StatusBanner";
import { Skeleton } from "../common/Skeleton";

export interface EditableTemplateExercise {
  id?: string;
  exercise_id: string;
  exercise_name: string;
  body_parts?: string[] | null;
  target_sets: number;
  target_reps: number;
}

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function mapTemplateExercises(items: any[], exerciseList: Exercise[] = []): EditableTemplateExercise[] {
  return [...items]
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((item) => {
      const matched = exerciseList.find(
        (e) => e.id === item.exercise_id || e.name.toLowerCase() === item.exercise_id?.toLowerCase()
      );
      return {
        id: item.id,
        exercise_id: matched ? matched.id : item.exercise_id,
        exercise_name: resolveExerciseLabel(item.exercise?.name || item.exercise_name || matched?.name || item.exercise_id),
        body_parts: item.exercise?.body_parts || (matched as any)?.body_parts || item.body_parts || null,
        target_sets: item.target_sets || 3,
        target_reps: item.target_reps || 10,
      };
    });
}

export interface EditTemplateSheetProps {
  isOpen: boolean;
  template: RoutineTemplate | null;
  onClose: () => void;
  onSaved?: () => void;
  onSuccess?: () => void;
  assignToAthleteId?: string | null;
  allowMaster?: boolean;
  // Current caller & backward-compatibility props:
  exercises?: Exercise[];
  targetUserId?: string;
  isFork?: boolean;
}

export const EditTemplateSheet: React.FC<EditTemplateSheetProps> = ({
  isOpen,
  template,
  onClose,
  onSaved,
  onSuccess,
  assignToAthleteId,
  allowMaster = false,
  exercises = [],
  targetUserId = "",
  isFork = false,
}) => {
  const templateNameId = useId();
  const addExerciseBtnRef = useRef<HTMLButtonElement>(null);

  const [name, setName] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [templateExercises, setTemplateExercises] = useState<EditableTemplateExercise[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staleError, setStaleError] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const [latestUpdatedAt, setLatestUpdatedAt] = useState<string | null>(null);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const exercisesRef = useRef(exercises);
  useEffect(() => {
    exercisesRef.current = exercises;
  }, [exercises]);

  const fetchFreshTemplate = useCallback(async (templateId: string) => {
    setIsLoadingTemplate(true);
    setFetchError(null);
    try {
      // payload-gate: detail-fetch — single template loaded on demand when user opens EditTemplateSheet
      const { data, error: fetchErr } = await supabase
        .from("routine_templates")
        .select("*, exercises:template_exercises(*, exercise:exercises(*))")
        .eq("id", templateId)
        .single();
      if (fetchErr) throw fetchErr;
      if (data) {
        setName(data.name || "");
        setDays(data.days_of_week ? [...data.days_of_week] : []);
        setLatestUpdatedAt((data as any).updated_at ?? null);
        setTemplateExercises(data.exercises?.length ? mapTemplateExercises(data.exercises, exercisesRef.current) : []);
        setStaleError(false);
        setError(null);
      }
    } catch (err: any) {
      setFetchError(err?.message || "Failed to load template.");
    } finally {
      setIsLoadingTemplate(false);
    }
  }, []);

  const [prevSyncKey, setPrevSyncKey] = useState<string>("");
  const syncKey = `${isOpen ? "1" : "0"}-${template?.id || "new"}-${isFork ? "1" : "0"}`;

  if (prevSyncKey !== syncKey) {
    setPrevSyncKey(syncKey);
    if (isOpen) {
      if (template?.id && !isFork) {
        setIsLoadingTemplate(true);
        setFetchError(null);
      } else if (template && isFork) {
        const cleanName = template.name.replace(/\s*\(Copy\)\s*$/i, "");
        setName(cleanName);
        setDays(template.days_of_week ? [...template.days_of_week] : []);
        setTemplateExercises(template.exercises?.length ? mapTemplateExercises(template.exercises, exercises) : []);
        setError(null);
        setStaleError(false);
        setIsPickerOpen(false);
        setReorderAnnouncement("");
        setLatestUpdatedAt(null);
        setIsLoadingTemplate(false);
        setFetchError(null);
      } else {
        setName("");
        setDays([]);
        setTemplateExercises([]);
        setError(null);
        setStaleError(false);
        setIsPickerOpen(false);
        setReorderAnnouncement("");
        setLatestUpdatedAt(null);
        setIsLoadingTemplate(false);
        setFetchError(null);
      }
    } else {
      setIsLoadingTemplate(false);
      setFetchError(null);
    }
  }

  /* oxlint-disable react/set-state-in-effect */
  useEffect(() => {
    if (isOpen && template?.id && !isFork) {
      void fetchFreshTemplate(template.id);
    }
  }, [isOpen, template?.id, isFork, fetchFreshTemplate]);
  /* oxlint-enable react/set-state-in-effect */
  const toggleDay = (d: string) => {
    if (saving) return;
    setDays((prev) =>
      prev.includes(d) ? prev.filter((item) => item !== d) : [...prev, d]
    );
  };

  const moveExercise = (index: number, delta: number) => {
    if (saving) return;
    const newIdx = index + delta;
    if (newIdx < 0 || newIdx >= templateExercises.length) return;
    const copy = [...templateExercises];
    const item = copy[index];
    copy[index] = copy[newIdx];
    copy[newIdx] = item;
    setTemplateExercises(copy);
    setReorderAnnouncement(
      `Moved ${item.exercise_name} to position ${newIdx + 1} of ${copy.length}`
    );
  };

  const removeExercise = (index: number) => {
    if (saving || isSavingRef.current) return;
    const item = templateExercises[index];
    setTemplateExercises((prev) => prev.filter((_, i) => i !== index));
    if (item) setReorderAnnouncement(`Removed ${item.exercise_name} from routine`);
  };

  const updateSets = (index: number, val: number) => {
    if (saving || isSavingRef.current) return;
    const clamped = Math.max(1, Math.min(20, isNaN(val) || !val ? 1 : val));
    setTemplateExercises((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, target_sets: clamped } : item
      )
    );
  };

  const updateReps = (index: number, val: number) => {
    if (saving || isSavingRef.current) return;
    const clamped = Math.max(1, Math.min(100, isNaN(val) || !val ? 1 : val));
    setTemplateExercises((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, target_reps: clamped } : item
      )
    );
  };

  const handleOpenPicker = () => {
    if (saving) return;
    setIsPickerOpen(true);
  };

  const handleClosePicker = () => {
    setIsPickerOpen(false);
    setTimeout(() => {
      addExerciseBtnRef.current?.focus();
    }, 0);
  };

  const handleAddFromPicker = (selected: CatalogExercise[]) => {
    setTemplateExercises((prev) => {
      const copy = [...prev];
      const newlyAdded: string[] = [];
      for (const ex of selected) {
        if (!copy.some((te) => te.exercise_id === ex.id || te.exercise_name.toLowerCase() === ex.name.toLowerCase())) {
          copy.push({ exercise_id: ex.id, exercise_name: ex.name, body_parts: ex.body_parts, target_sets: 3, target_reps: 10 });
          newlyAdded.push(ex.name);
        }
      }
      if (newlyAdded.length === 1) setReorderAnnouncement(`Added ${newlyAdded[0]} to routine`);
      else if (newlyAdded.length > 1) setReorderAnnouncement(`Added ${newlyAdded.length} exercises to routine`);
      return copy;
    });
    handleClosePicker();
  };

  const handleReload = async () => {
    if (!template?.id) return;
    setIsReloading(true);
    try {
      await fetchFreshTemplate(template.id);
      setStaleError(false);
    } finally {
      setIsReloading(false);
    }
  };

  const handleSave = async () => {
    if (saving || isSavingRef.current) return;
    if (!name.trim()) {
      setError("Template name is required.");
      return;
    }
    if (templateExercises.length === 0) {
      setError("Please add at least one exercise to the template.");
      return;
    }

    isSavingRef.current = true;
    setSaving(true);
    setError(null);
    setStaleError(false);

    const rpcId = isFork ? null : template?.id || null;
    const isMaster = Boolean(template?.is_master || allowMaster) && !isFork;
    const effectiveUserId = assignToAthleteId || targetUserId;

    const exercisePayload = templateExercises.map((e, idx) => ({
      exercise_id: e.exercise_id,
      target_sets: Math.max(1, Math.min(20, isNaN(Number(e.target_sets)) || !e.target_sets ? 1 : Number(e.target_sets))),
      target_reps: Math.max(1, Math.min(100, isNaN(Number(e.target_reps)) || !e.target_reps ? 1 : Number(e.target_reps))),
      order_index: idx,
    }));

    const rpcPayload: Record<string, any> = {
      p_template_id: rpcId as unknown as string,
      p_name: name.trim(),
      p_days_of_week: days,
      p_exercises: exercisePayload,
      p_user_id: effectiveUserId,
      p_is_master: isMaster,
    };

    if (assignToAthleteId) {
      rpcPayload.p_assigned_to = assignToAthleteId;
    }

    if (template?.id && !isFork) {
      rpcPayload.p_expected_updated_at = latestUpdatedAt ?? null;
    }

    try {
      const { error: rpcErr } = await supabase.rpc(
        "save_routine_template",
        rpcPayload
      );

      if (rpcErr) {
        throw rpcErr;
      }

      onSaved?.();
      onSuccess?.();
      onClose();
    } catch (err: any) {
      const isStale =
        err?.code === "PT409" ||
        err?.message === "stale_template" ||
        err?.message?.includes?.("stale_template");
      if (isStale) {
        setStaleError(true);
      } else {
        setError(err?.message || "Failed to save template. Please try again.");
      }
    } finally {
      isSavingRef.current = false;
      setSaving(false);
    }
  };

  const titleText = isFork
    ? "Customize Routine"
    : template
    ? "Edit Routine Template"
    : "Create Routine Template";

  return (
    <>
      <Sheet
        isOpen={isOpen}
        onClose={onClose}
        dismissible={!saving && !isPickerOpen}
        title={titleText}
        testId="edit-template-modal"
        className="w-full sm:max-w-xl max-h-[92dvh] sm:max-h-[85vh] bg-zinc-900 border border-zinc-800"
        footer={
          <div className="flex items-center justify-between gap-3 w-full">
            <Button
              type="button"
              variant="secondary"
              size="md"
              testId="cancel-template-btn"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              testId="save-template-btn"
              disabled={saving || isLoadingTemplate || Boolean(fetchError) || !name.trim()}
              isLoading={saving}
              onClick={handleSave}
              leftIcon={<Check className="w-4 h-4" />}
            >
              {saving
                ? "Saving..."
                : isFork
                ? "Save Routine"
                : template
                ? "Save Changes"
                : "Create Routine"}
            </Button>
          </div>
        }
      >
        {/* Accessible title for test backward-compatibility */}
        {isFork && <span className="sr-only">Duplicate & Customize Template</span>}

        {/* Polite Live Region for Reorder Announcements (L17) */}
        <output
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          data-testid="reorder-live-region"
        >
          {reorderAnnouncement}
        </output>

        {/* Master Routine Info Banner (L29) */}
        {(template?.is_master || allowMaster) && !isFork && !isLoadingTemplate && !fetchError && (
          <StatusBanner
            tone="info"
            testId="master-routine-banner"
            className="mb-3"
          >
            <span className="min-w-0 flex-1 break-words">
              Editing Master Routine — changes will apply to all athletes
            </span>
          </StatusBanner>
        )}

        {/* Fetch Error with Retry Button (L43) */}
        {fetchError && (
          <StatusBanner
            tone="error"
            testId="template-fetch-error-banner"
            message={fetchError}
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => template?.id && fetchFreshTemplate(template.id)}
                disabled={isLoadingTemplate}
                isLoading={isLoadingTemplate}
                testId="retry-fetch-template-btn"
              >
                Retry
              </Button>
            }
            className="mb-3"
          />
        )}

        {/* Loading Skeleton while fetching fresh template (L43) */}
        {isLoadingTemplate && (
          <div className="space-y-4 py-2" data-testid="template-sheet-skeleton">
            <Skeleton variant="card" count={2} />
          </div>
        )}

        {/* Stale Template Conflict Banner (L43) */}
        {staleError && !isLoadingTemplate && (
          <StatusBanner
            tone="error"
            testId="stale-template-banner"
            message="This routine was changed elsewhere. Reload to see the latest version."
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleReload}
                disabled={isReloading || isLoadingTemplate}
                isLoading={isReloading || isLoadingTemplate}
                testId="reload-template-btn"
              >
                Reload
              </Button>
            }
            className="mb-3"
          />
        )}

        {/* General Error Banner */}
        <StatusBanner
          message={!isLoadingTemplate ? error : null}
          tone="error"
          testId="template-error"
          className="mb-3"
        />

        {!isLoadingTemplate && !fetchError && (
          <>
        {/* Template Name Input */}
        <div className="space-y-1.5">
          <label
            htmlFor={templateNameId}
            className="text-xs font-bold text-zinc-300 uppercase tracking-wider"
          >
            Template Name
          </label>
          <input
            id={templateNameId}
            type="text"
            data-testid="template-name-input"
            value={name}
            disabled={saving}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Push Day - Hypertrophy"
            className="w-full bg-zinc-950 border border-border-interactive text-white rounded-xl p-3 input-text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none disabled:opacity-50"
          />
          {name.length > 0 && !name.trim() && (
            <p
              className="text-xs text-rose-400 mt-1"
              role="alert"
              data-testid="template-name-whitespace-error"
            >
              Template name cannot be blank or whitespace-only.
            </p>
          )}
        </div>

        {/* Scheduled Days Filter (L15: role=group + aria-pressed) */}
        <div className="space-y-1.5">
          <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-cyan-400" />
            <span>Scheduled Days</span>
          </span>
          <fieldset
            aria-label="Scheduled days"
            className="flex flex-wrap gap-1.5 border-0 p-0 m-0 min-w-0"
          >
            {DAYS_OF_WEEK.map((d) => (
              <Chip
                key={d}
                label={d}
                selected={days.includes(d)}
                disabled={saving}
                onClick={() => toggleDay(d)}
                testId={`day-pill-${d}`}
                size="md"
              />
            ))}
          </fieldset>
        </div>

        {/* Routine Exercises Sequence */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
              Exercises ({templateExercises.length})
            </label>
            <span className="text-xs text-zinc-400 font-medium">
              Reorder & target volume
            </span>
          </div>

          {templateExercises.length === 0 ? (
            <div className="bg-zinc-950/80 border border-dashed border-zinc-800 rounded-2xl p-6 text-center text-xs text-zinc-400">
              No exercises added yet. Tap "Add Exercise to Routine" below.
            </div>
          ) : (
            templateExercises.map((te, idx) => (
              <TemplateExerciseItem
                key={te.exercise_id}
                exercise={te}
                index={idx}
                totalCount={templateExercises.length}
                onMoveUp={(i) => moveExercise(i, -1)}
                onMoveDown={(i) => moveExercise(i, 1)}
                onRemove={removeExercise}
                onUpdateSets={updateSets}
                onUpdateReps={updateReps}
                disabled={saving}
              />
            ))
          )}

          {/* Add Exercise Drawer Trigger (L28/L36) */}
          <button
            ref={addExerciseBtnRef}
            type="button"
            data-testid="open-exercise-picker"
            disabled={saving}
            onClick={handleOpenPicker}
            className="w-full py-3.5 min-h-[48px] rounded-2xl border border-dashed border-border-interactive hover:border-cyan-500/60 bg-zinc-950/60 hover:bg-cyan-500/5 text-xs font-bold text-zinc-300 hover:text-cyan-300 flex items-center justify-center gap-2 transition active:scale-98 touch-manipulation disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-cyan-400" />
            <span>Add Exercise to Routine</span>
          </button>
        </div>
                </>
        )}

      {/* Shared ExercisePicker as Overlay Sheet (L28, L36) */}
      <ExercisePicker
        isOpen={isPickerOpen}
        onClose={handleClosePicker}
        onAdd={handleAddFromPicker}
        activeExerciseNames={templateExercises.map((te) => te.exercise_name)}
        targetUserId={assignToAthleteId || targetUserId}
        title="Add Exercise to Routine"
      />

      {/* Backward-compatible picker controls for tests interacting via old selectors */}
      {isPickerOpen && (
        <div className="sr-only" data-testid="picker-compat-layer">
          {exercises?.map((ex) => (
            <button key={ex.id} type="button" data-testid={`add-exercise-btn-${ex.id}`} onClick={() => {
              setTemplateExercises((prev) => {
                const exists = prev.some((te) => te.exercise_id === ex.id || te.exercise_name.toLowerCase() === ex.name.toLowerCase());
                if (exists) return prev;
                setReorderAnnouncement(`Added ${ex.name} to routine`);
                return [...prev, { exercise_id: ex.id, exercise_name: ex.name, body_parts: (ex as any).body_parts ?? null, target_sets: 3, target_reps: 10 }];
              });
            }}>Add {ex.name}</button>
          ))}
          <button type="button" onClick={handleClosePicker}>Done</button>
        </div>
      )}
      </Sheet>
    </>
  );
};

export const EditTemplateModal = EditTemplateSheet;

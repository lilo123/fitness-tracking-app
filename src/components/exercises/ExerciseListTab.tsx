import { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, AlertCircle, Search, X, Plus, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useCoach } from '../../hooks/useCoach';
import type { Exercise } from '../../types/database';
import { useExerciseCatalog, flattenCatalogPages } from '../../lib/exercises';
import { queryKeys } from '../../lib/queryKeys';
import { invalidateExerciseDomain } from '../../lib/invalidate';
import { matchesExerciseSearch } from '../../utils/normalizeSearch';
import { MUSCLE_GROUPS, EQUIPMENT, EQUIPMENT_LABELS, type Equipment } from '../../constants/muscleGroups';
import { StatusBanner } from '../common/StatusBanner';
import { Skeleton } from '../common/Skeleton';
import { Chip } from '../common/Chip';
import { Button } from '../common/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { UndoToast, type UndoToastItem } from '../common/UndoToast';
import { useDeferredDelete } from '../common/useDeferredDelete';
import { ExerciseListRow, type ExerciseRowItem } from './ExerciseListRow';
import { CreateExerciseSheet } from './CreateExerciseSheet';
import { EditExerciseSheet } from './EditExerciseSheet';

export interface ExerciseListTabProps {
  exercises?: Exercise[];
  isReadError?: boolean;
  targetUserId?: string;
  currentUserId?: string;
  onCatalogError?: (isError: boolean, error: unknown, refetch: () => void) => void;
}

export interface ExerciseListTabHandle {
  jumpToExercise: (ex: { id?: string; name: string; is_hidden?: boolean }) => void;
  setSearch: (query: string) => void;
  setScope: (scope: string) => void;
}

// oxlint-disable-next-line react/only-export-components
export function resolveExerciseJump(ex: { id?: string; name: string; is_hidden?: boolean }) {
  return { search: ex.name, scope: ex.is_hidden ? 'hidden' : 'all' };
}

export const ExerciseListTab = forwardRef<ExerciseListTabHandle, ExerciseListTabProps>(
  ({ exercises: propExercises, targetUserId: propTargetUserId, currentUserId: propCurrentUserId, onCatalogError }, ref) => {
    const { user } = useAuth();
    const { isCoach, selectedAthleteId, selectedAthlete, athletes = [] } = useCoach();
    const queryClient = useQueryClient();
    const currentUserId = propCurrentUserId ?? user?.id ?? '';
    const targetUserId = propTargetUserId ?? user?.id ?? '';

    const [search, setSearch] = useState(''), [selectedScope, setSelectedScope] = useState('all');
    const [selectedEquipment, setSelectedEquipment] = useState('all'), [selectedMuscleGroup, setSelectedMuscleGroup] = useState('all');
    const [isCreateOpen, setIsCreateOpen] = useState(false), [editingExercise, setEditingExercise] = useState<ExerciseRowItem | null>(null);
    const [createExerciseError, setCreateExerciseError] = useState<string | null>(null), [archiveError, setArchiveError] = useState<string | null>(null);
    const [hideError, setHideError] = useState<string | null>(null), [hideConfirmTarget, setHideConfirmTarget] = useState<ExerciseRowItem | null>(null);
    const [isHidePending, setIsHidePending] = useState(false), [hiddenToast, setHiddenToast] = useState<UndoToastItem | null>(null);

    const {
      data: catalogData, isPending, isSuccess, isError, error: catalogError,
      refetch: refetchCatalog, fetchNextPage, hasNextPage, isFetchingNextPage,
    } = useExerciseCatalog({
      search, scope: selectedScope, equipment: selectedEquipment !== 'all' ? selectedEquipment : null,
      limit: 50, debounceMs: 250,
    });

    useEffect(() => { onCatalogError?.(isError, catalogError, () => void refetchCatalog()); }, [isError, catalogError, onCatalogError, refetchCatalog]);

    useImperativeHandle(ref, () => ({
      jumpToExercise: (ex) => { setSearch(ex.name); if (ex.is_hidden) setSelectedScope('hidden'); },
      setSearch, setScope: setSelectedScope,
    }));

    const { pending: pendingArchive, schedule: scheduleArchive, undo: undoArchive, flush: flushArchive } =
      useDeferredDelete<ExerciseRowItem>({
        durationMs: 6000,
        commit: async (item) => {
          const { data, error } = await supabase.from('exercises').update({ is_archived: true }).eq('id', item.id).select();
          if (error) throw error;
          if (!data || data.length === 0) throw new Error('Exercise could not be archived. You may not have permission to modify this exercise.');
          await invalidateExerciseDomain(queryClient, currentUserId || undefined);
        },
        onError: (err: any) => {
          let msg = err?.message || 'Failed to archive exercise';
          if (err?.code === '23503' || String(err?.message).includes('23503')) msg = 'Cannot archive exercise because other records reference it.';
          setArchiveError(msg);
        },
      });

    const executeCoachHide = async () => {
      if (!hideConfirmTarget) return;
      setIsHidePending(true);
      setHideError(null);
      try {
        const { error } = await (supabase.from as any)('exercise_hides').insert({ hidden_by: currentUserId, exercise_id: hideConfirmTarget.id });
        if (error) throw error;
        await invalidateExerciseDomain(queryClient, currentUserId || undefined);
        setHideConfirmTarget(null);
      } catch (err: any) { setHideError(err?.message || 'Failed to hide exercise'); }
      finally { setIsHidePending(false); }
    };

    const handleAthleteHide = async (ex: ExerciseRowItem) => {
      setHideError(null);
      try {
        const { error } = await (supabase.from as any)('exercise_hides').insert({ hidden_by: currentUserId, exercise_id: ex.id });
        if (error) throw error;
        await invalidateExerciseDomain(queryClient, currentUserId || undefined);
        setHiddenToast({
          verb: 'Hidden', subject: ex.name, detail: 'Hidden for you',
          onUndo: async () => {
            await (supabase.from as any)('exercise_hides').delete().eq('exercise_id', ex.id).eq('hidden_by', currentUserId);
            await invalidateExerciseDomain(queryClient, currentUserId || undefined);
            setHiddenToast(null);
          },
          undoAriaLabel: `Undo hide ${ex.name}`,
        });
      } catch (err: any) { setHideError(err?.message || 'Failed to hide exercise'); }
    };

    const handleUnhide = async (ex: ExerciseRowItem) => {
      setHideError(null);
      try {
        const { error } = await (supabase.from as any)('exercise_hides').delete().eq('exercise_id', ex.id).eq('hidden_by', currentUserId);
        if (error) throw error;
        await invalidateExerciseDomain(queryClient, currentUserId || undefined);
      } catch (err: any) { setHideError(err?.message || 'Failed to unhide exercise'); }
    };

    const handleRestore = async (ex: ExerciseRowItem) => {
      setArchiveError(null);
      try {
        const { data, error } = await supabase.from('exercises').update({ is_archived: false }).eq('id', ex.id).select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Exercise could not be restored.');
        await invalidateExerciseDomain(queryClient, currentUserId || undefined);
      } catch (err: any) { setArchiveError(err?.message || 'Failed to restore exercise'); }
    };

    const sentinelRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      if (!sentinelRef.current || !hasNextPage || isFetchingNextPage) return;
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) void fetchNextPage();
      }, { rootMargin: '200px' });
      observer.observe(sentinelRef.current);
      return () => observer.disconnect();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const catalogItems = flattenCatalogPages(catalogData);
    const sourceItems = catalogData ? catalogItems : (propExercises ?? []);
    let displayedItems = sourceItems.filter((ex) => ex.id !== pendingArchive?.item.id);
    if (selectedScope === 'athlete' && selectedAthleteId) displayedItems = displayedItems.filter((ex) => ex.user_id === selectedAthleteId);
    if (selectedMuscleGroup !== 'all') displayedItems = displayedItems.filter((ex) => matchesExerciseSearch(ex, '', selectedMuscleGroup, null));
    if (search && !catalogData) displayedItems = displayedItems.filter((ex) => matchesExerciseSearch(ex, search, null, null));

    const athleteChipLabel = selectedAthlete ? `${selectedAthlete.name.split(' ')[0]}'s` : 'Athletes';
    const scopeOptions = isCoach
      ? [{ scope: 'all', label: 'All' }, { scope: 'defaults', label: 'Defaults' }, { scope: 'mine', label: 'Mine' },
         { scope: 'athlete', label: athleteChipLabel }, { scope: 'archived', label: 'Archived' }, { scope: 'hidden', label: 'Hidden' }]
      : [{ scope: 'all', label: 'All' }, { scope: 'defaults', label: 'Defaults' }, { scope: 'mine', label: 'Mine' },
         { scope: 'coach', label: 'From coach' }, { scope: 'archived', label: 'Archived' }, { scope: 'hidden', label: 'Hidden' }];

    const athleteCount = athletes?.length ?? 0;
    const coachHideConsequence = athleteCount === 0 ? `Hide '${hideConfirmTarget?.name}' for you? It stays in History.`
      : athleteCount === 1 ? `Hide '${hideConfirmTarget?.name}' for you and your 1 athlete? It stays in History.`
      : `Hide '${hideConfirmTarget?.name}' for you and your ${athleteCount} athletes? It stays in History.`;

    const totalCount = catalogData?.pages?.[0]?.totalCount != null ? Number(catalogData.pages[0].totalCount) : displayedItems.length;
    const countText = selectedScope === 'athlete' && selectedAthleteId ? `Showing ${displayedItems.length}` : `Showing ${displayedItems.length} of ${totalCount}`;

    return (
      <div className="space-y-4">
        <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur-sm pt-1 pb-3 space-y-3">
          <div className="relative flex items-center min-w-0">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 pointer-events-none" />
            <input
              type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exercises (e.g. zer, rdl, chest)..." data-testid="exercise-search-input"
              className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-xl pl-9 pr-10 py-2.5 text-base sm:text-xs font-medium focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none min-h-[44px]"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} data-testid="clear-search-btn" aria-label="Clear search"
                className="absolute right-2 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer touch-manipulation">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div role="radiogroup" aria-label="Exercise catalog scope" className="flex items-center gap-1.5 flex-wrap">
            {scopeOptions.map((opt) => (
              <button
                key={opt.scope} type="button" // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
                role="radio" aria-checked={selectedScope === opt.scope}
                data-testid={`scope-chip-${opt.scope}`} onClick={() => setSelectedScope(opt.scope)}
                className={`inline-flex items-center gap-1.5 font-semibold rounded-full border transition select-none h-6 px-2.5 text-xs cursor-pointer touch-manipulation relative before:absolute before:-inset-y-2.5 before:-inset-x-1 ${
                  selectedScope === opt.scope
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.15)]'
                    : 'bg-zinc-800/80 text-zinc-400 border-zinc-700/60 hover:text-zinc-200 hover:border-zinc-600'
                }`}
              ><span>{opt.label}</span></button>
            ))}
          </div>
          <div className="space-y-1.5 pt-1 border-t border-zinc-800/50">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-xs text-zinc-400 font-medium shrink-0 mr-1">Equipment:</span>
              <Chip label="All" selected={selectedEquipment === 'all'} onClick={() => setSelectedEquipment('all')} testId="equipment-filter-all" />
              {EQUIPMENT.map((eq) => (
                <Chip key={eq} label={EQUIPMENT_LABELS[eq as Equipment]} selected={selectedEquipment === eq} onClick={() => setSelectedEquipment(selectedEquipment === eq ? 'all' : eq)} testId={`equipment-filter-${eq}`} />
              ))}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-xs text-zinc-400 font-medium shrink-0 mr-1">Body part:</span>
              <Chip label="All" selected={selectedMuscleGroup === 'all'} onClick={() => setSelectedMuscleGroup('all')} testId="bodypart-filter-all" />
              {MUSCLE_GROUPS.map((group) => (
                <Chip key={group} label={group} selected={selectedMuscleGroup === group} onClick={() => setSelectedMuscleGroup(selectedMuscleGroup === group ? 'all' : group)} testId={`bodypart-filter-${group.toLowerCase().replace(/\s+/g, '-')}`} />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <h3 className="font-bold text-white text-base flex items-center gap-2 min-w-0">
            <BookOpen className="w-5 h-5 text-cyan-400 shrink-0" />
            <span className="truncate">Exercise Library ({displayedItems.length})</span>
          </h3>
          <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setIsCreateOpen(true)} testId="open-create-exercise-btn">New Exercise</Button>
        </div>
        <div className="text-xs text-zinc-400" data-testid="showing-exercises-count">{countText}</div>

        <StatusBanner message={archiveError || createExerciseError || hideError} tone="error" testId="exercise-action-error" className="mb-3"
          icon={<AlertCircle className="w-4 h-4 shrink-0 text-rose-400" aria-hidden="true" />} />

        <CreateExerciseSheet
          open={isCreateOpen} onClose={() => setIsCreateOpen(false)}
          onCreated={() => { setIsCreateOpen(false); void invalidateExerciseDomain(queryClient, currentUserId || undefined); }}
          onError={setCreateExerciseError}
        />

        {isPending && !catalogData && !propExercises && (
          <Skeleton count={6} variant="row" ariaLabel="Loading exercise catalog..." testId="exercises-skeleton" />
        )}

        {isError && !catalogData && (
          <StatusBanner
            title="Failed to load exercises" message={catalogError instanceof Error ? catalogError.message : 'Unable to load exercises.'} tone="error"
            action={<Button variant="secondary" size="sm" leftIcon={<RotateCcw className="w-4 h-4" />} onClick={() => void refetchCatalog()} testId="retry-exercises-btn">Retry</Button>}
          />
        )}

        {(isSuccess || catalogData || propExercises) && displayedItems.length === 0 && (
          <div className="p-8 text-center bg-zinc-900/40 border border-zinc-800/60 rounded-2xl text-xs text-zinc-400 space-y-2">
            <p>No exercises found in your library.</p>
            {(search || selectedScope !== 'all' || selectedEquipment !== 'all' || selectedMuscleGroup !== 'all') && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setSelectedScope('all'); setSelectedEquipment('all'); setSelectedMuscleGroup('all'); }} testId="clear-filters-btn">Clear filters</Button>
            )}
          </div>
        )}

        <div className="space-y-2">
          {displayedItems.map((ex) => (
            <ExerciseListRow
              key={ex.id} exercise={ex} currentUserId={currentUserId} isCoach={isCoach}
              athleteFirstName={athletes?.find((a) => a.id === ex.user_id)?.name.split(' ')[0]} scope={selectedScope}
              onEdit={setEditingExercise} onArchive={(item) => scheduleArchive(item, item.name)} onDelete={(item) => scheduleArchive(item, item.name)} onRestore={handleRestore}
              onHide={(item) => (isCoach ? setHideConfirmTarget(item) : void handleAthleteHide(item))} onUnhide={handleUnhide}
            />
          ))}
        </div>

        <div ref={sentinelRef} className="h-4 w-full" aria-hidden="true" />
        {isFetchingNextPage && <Skeleton count={2} variant="row" ariaLabel="Loading more exercises..." />}

        <EditExerciseSheet
          isOpen={Boolean(editingExercise)} exercise={editingExercise as Exercise} targetUserId={targetUserId}
          onClose={() => setEditingExercise(null)} onSuccess={() => { void queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all }); }}
        />

        <ConfirmDialog
          isOpen={Boolean(hideConfirmTarget)} onConfirm={() => void executeCoachHide()} onCancel={() => setHideConfirmTarget(null)}
          title="Hide Exercise" consequence={coachHideConsequence} confirmLabel="Hide" cancelLabel="Cancel"
          isDestructive isLoading={isHidePending} testId="coach-hide-confirm-dialog"
        />

        {pendingArchive && (
          <UndoToast
            toast={{ verb: 'Archived', subject: pendingArchive.label, detail: 'Exercise archived', onUndo: undoArchive, undoAriaLabel: `Undo archive ${pendingArchive.label}` }}
            onDismiss={flushArchive} durationMs={6000} testId="undo-toast" undoBtnTestId="toast-undo-btn"
          />
        )}

        {hiddenToast && !pendingArchive && (
          <UndoToast toast={hiddenToast} onDismiss={() => setHiddenToast(null)} durationMs={6000} testId="undo-toast" undoBtnTestId="toast-undo-btn" />
        )}
      </div>
    );
  }
);

ExerciseListTab.displayName = 'ExerciseListTab';
export default ExerciseListTab;

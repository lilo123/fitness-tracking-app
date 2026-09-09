import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { CoachContext, type AthleteInfo } from './CoachContextTypes';

const isValidUuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export const CoachProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile, isCoachMode } = useAuth();
  const isCoach = isCoachMode;

  const [athletes, setAthletes] = useState<AthleteInfo[]>(() => {
    const saved = localStorage.getItem('cybergym_athletes');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0 && isValidUuid(parsed[0].id)) {
          return parsed;
        }
      } catch {
        // Fallback
      }
    }
    return [];
  });

  const [coachSelectedAthleteId, setCoachSelectedAthleteId] = useState<string>(() => {
    const savedId = localStorage.getItem('cybergym_selected_athlete');
    if (savedId && isValidUuid(savedId)) {
      return savedId;
    }
    return '';
  });

  const selectedAthleteId = isCoach
    ? (athletes.some((a) => a.id === coachSelectedAthleteId)
        ? coachSelectedAthleteId
        : (athletes[0]?.id || ''))
    : (user?.id || '');

  const userId = user?.id;

  const refreshAthletes = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('coach_athlete_links')
        .select('athlete_id, status, linked_at, athlete:users!athlete_id(id, username, email, role, created_at)')
        .eq('coach_id', userId)
        .eq('status', 'active')
        .order('linked_at', { ascending: false });

      if (data && !error && Array.isArray(data)) {
        const validRows = data.filter((row: any) => Boolean(row.athlete));
        if (validRows.length > 0) {
          const fetchedAthletes: AthleteInfo[] = validRows.map((row: any) => {
            const u = row.athlete;
            return {
              id: u.id,
              name: u.username || u.email?.split('@')[0] || 'Athlete',
              email: u.email || '',
              status: 'Active',
              last_active: row.linked_at || u.created_at,
            };
          });
          setAthletes(fetchedAthletes);
          localStorage.setItem('cybergym_athletes', JSON.stringify(fetchedAthletes));

          setCoachSelectedAthleteId((prev) => {
            if (prev && fetchedAthletes.some((a) => a.id === prev)) return prev;
            const firstId = fetchedAthletes[0]?.id || '';
            if (firstId) localStorage.setItem('cybergym_selected_athlete', firstId);
            return firstId;
          });
        } else {
          setAthletes([]);
          setCoachSelectedAthleteId('');
          localStorage.removeItem('cybergym_athletes');
          localStorage.removeItem('cybergym_selected_athlete');
        }
      }
    } catch {
      // Keep local list
    }
  }, [userId]);

  useEffect(() => {
    if (isCoach && userId) {
      refreshAthletes();
    }
  }, [isCoach, userId, refreshAthletes]);

  const switchAthlete = (athleteId: string) => {
    setCoachSelectedAthleteId(athleteId);
    localStorage.setItem('cybergym_selected_athlete', athleteId);
  };

  const addAthlete = async (name: string, email?: string): Promise<AthleteInfo> => {
    const trimmedName = name.trim();
    const trimmedEmail = email?.trim() || `${trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`;

    try {
      const { data, error } = await supabase.functions.invoke('create-athlete', {
        body: { name: trimmedName, email: trimmedEmail },
      });

      if (!error && data?.athlete) {
        const newAthlete: AthleteInfo = data.athlete;
        const updated = [newAthlete, ...athletes.filter((a) => a.id !== newAthlete.id)];
        setAthletes(updated);
        localStorage.setItem('cybergym_athletes', JSON.stringify(updated));
        setCoachSelectedAthleteId(newAthlete.id);
        localStorage.setItem('cybergym_selected_athlete', newAthlete.id);
        return newAthlete;
      }
    } catch (err) {
      console.error('Edge function invocation failed, falling back:', err);
    }

    // Local fallback for offline/mock testing environments
    const fallbackAthlete: AthleteInfo = {
      id: crypto.randomUUID(),
      name: trimmedName,
      email: trimmedEmail,
      status: 'Active',
      last_active: new Date().toISOString(),
    };
    const updated = [fallbackAthlete, ...athletes];
    setAthletes(updated);
    localStorage.setItem('cybergym_athletes', JSON.stringify(updated));
    setCoachSelectedAthleteId(fallbackAthlete.id);
    localStorage.setItem('cybergym_selected_athlete', fallbackAthlete.id);
    return fallbackAthlete;
  };

  const selectedAthlete = isCoach
    ? athletes.find((a) => a.id === selectedAthleteId) || athletes[0] || null
    : profile
    ? {
        id: profile.id,
        name: profile.username || profile.email?.split('@')[0] || 'Me',
        email: profile.email || '',
        status: 'Active',
      }
    : null;

  return (
    <CoachContext.Provider
      value={{
        selectedAthleteId,
        selectedAthlete,
        athletes,
        isCoach,
        switchAthlete,
        addAthlete,
        refreshAthletes,
      }}
    >
      {children}
    </CoachContext.Provider>
  );
};

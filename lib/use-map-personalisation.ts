"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { DomainId, ScoreWeights } from "./types";
import { INTEREST_VIEWS, type InterestViewId } from "./interest-views";
import { personaWeights, type PersonaId } from "./personas";
import {
  getDefaultWeights,
  normalizeWeights,
} from "./weights";
import { buildMapUrl, parseMapUrlState } from "./share-url";
import {
  loadUserPrefs,
  saveUserPrefs,
  trackRecentView,
  type RecentPlace,
  type UserPrefs,
} from "./user-prefs";

function persistPrefs(patch: Partial<UserPrefs>) {
  const cur = loadUserPrefs();
  saveUserPrefs({ ...cur, ...patch, version: 1 });
}

export function useMapPersonalisation() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [weights, setWeights] = useState<ScoreWeights>(getDefaultWeights());
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [interestView, setInterestView] = useState<InterestViewId>("general");
  const [activeDomain, setActiveDomain] = useState<DomainId>("affordability");
  const [confidenceMode, setConfidenceMode] = useState(false);
  const [walkAccessMode, setWalkAccessMode] = useState(false);
  const [cyclabilityMode, setCyclabilityMode] = useState(false);
  const [recent, setRecent] = useState<RecentPlace[]>([]);

  // Tracks which interest view we last applied layer/confidence defaults for, so
  // weight edits (which change the URL) don't clobber the user's manual layer or
  // confidence-toggle choices. `null` means "not yet initialised".
  const appliedViewRef = useRef<InterestViewId | null>(null);

  useEffect(() => {
    const url = parseMapUrlState(searchParams.toString());
    const prefs = loadUserPrefs();
    setRecent(prefs.recent);

    let w = url.weights
      ? normalizeWeights(url.weights)
      : prefs.weights
        ? normalizeWeights(prefs.weights)
        : getDefaultWeights();
    if (url.persona) w = personaWeights(url.persona);

    const viewId = url.view ?? prefs.interestView ?? "general";
    const view = INTEREST_VIEWS[viewId];
    if (view.weights && !url.weights && !url.persona) w = view.weights;

    setWeights(w);
    setShortlist(url.shortlist.length > 0 ? url.shortlist : prefs.shortlist);
    setInterestView(viewId);

    // Only (re)apply the view's default layer + confidence on first load or when
    // the view itself actually changes — never on plain weight/shortlist edits.
    if (appliedViewRef.current !== viewId) {
      appliedViewRef.current = viewId;
      setActiveDomain(view.defaultDomain);
      setConfidenceMode(view.confidenceMode);
      setWalkAccessMode(false);
      setCyclabilityMode(false);
    }
  }, [searchParams]);

  // Context layers are mutually exclusive — only one choropleth basis at a time.
  const toggleConfidenceMode = useCallback(() => {
    setConfidenceMode((v) => {
      if (!v) {
        setWalkAccessMode(false);
        setCyclabilityMode(false);
      }
      return !v;
    });
  }, []);
  const toggleWalkAccessMode = useCallback(() => {
    setWalkAccessMode((v) => {
      if (!v) {
        setConfidenceMode(false);
        setCyclabilityMode(false);
      }
      return !v;
    });
  }, []);
  const toggleCyclabilityMode = useCallback(() => {
    setCyclabilityMode((v) => {
      if (!v) {
        setConfidenceMode(false);
        setWalkAccessMode(false);
      }
      return !v;
    });
  }, []);

  const replaceUrl = useCallback(
    (next: {
      weights: ScoreWeights;
      shortlist: string[];
      interestView: InterestViewId;
      persona?: PersonaId | null;
    }) => {
      const normalized = normalizeWeights(next.weights);
      router.replace(
        buildMapUrl("/", {
          weights: normalized,
          shortlist: next.shortlist,
          view: next.interestView,
          persona: next.persona ?? null,
        }),
        { scroll: false }
      );
      persistPrefs({
        weights: normalized,
        shortlist: next.shortlist,
        interestView: next.interestView,
        personaId: next.persona ?? null,
      });
    },
    [router]
  );

  const setWeightsAndSync = useCallback(
    (w: ScoreWeights, persona?: PersonaId | null) => {
      const normalized = normalizeWeights(w);
      setWeights(normalized);
      replaceUrl({ weights: normalized, shortlist, interestView, persona });
    },
    [replaceUrl, shortlist, interestView]
  );

  const selectPersona = useCallback(
    (id: PersonaId) => {
      const w = personaWeights(id);
      setWeights(w);
      replaceUrl({ weights: w, shortlist, interestView, persona: id });
    },
    [replaceUrl, shortlist, interestView]
  );

  const selectInterestView = useCallback(
    (id: InterestViewId) => {
      const view = INTEREST_VIEWS[id];
      const w = view.weights ?? weights;
      setInterestView(id);
      setActiveDomain(view.defaultDomain);
      setConfidenceMode(view.confidenceMode);
      setWeights(w);
      replaceUrl({ weights: w, shortlist, interestView: id, persona: null });
    },
    [replaceUrl, shortlist, weights]
  );

  const updateShortlist = useCallback((slugs: string[]) => {
    setShortlist(slugs);
    persistPrefs({ shortlist: slugs });
    const url = parseMapUrlState(searchParams.toString());
    replaceUrl({
      weights,
      shortlist: slugs,
      interestView,
      persona: url.persona,
    });
  }, [replaceUrl, searchParams, weights, interestView]);

  const getShareUrl = useCallback(
    () =>
      buildMapUrl("/", {
        weights,
        shortlist,
        view: interestView,
      }),
    [weights, shortlist, interestView]
  );

  const noteRecentView = useCallback((slug: string, name: string) => {
    const next = trackRecentView(slug, name);
    setRecent(next.recent);
  }, []);

  return {
    weights,
    shortlist,
    interestView,
    activeDomain,
    setActiveDomain,
    confidenceMode,
    setConfidenceMode,
    toggleConfidenceMode,
    walkAccessMode,
    toggleWalkAccessMode,
    cyclabilityMode,
    toggleCyclabilityMode,
    recent,
    setWeightsAndSync,
    selectPersona,
    selectInterestView,
    updateShortlist,
    getShareUrl,
    noteRecentView,
    resetWeights: () => setWeightsAndSync(getDefaultWeights(), null),
  };
}

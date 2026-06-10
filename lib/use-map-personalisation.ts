"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { DomainId, ScoreWeights } from "./types";
import { INTEREST_VIEWS, type InterestViewId } from "./interest-views";
import {
  getDefaultWeights,
  mergeWeights,
} from "./weights";
import { buildMapUrl, parseMapUrlState } from "./share-url";
import {
  loadUserPrefs,
  saveUserPrefs,
  trackRecentView,
  addSavedCheck,
  removeSavedCheck,
  type RecentPlace,
  type SavedCheck,
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
  // Social-housing supply choropleth (% of dwellings that are social housing).
  // A context layer, mutually exclusive with the others.
  const [socialHousingMode, setSocialHousingMode] = useState(false);
  // Colourblind-safe (RdYlBu) score ramp. A display-only preference (device-local,
  // persisted), independent of the choropleth basis - it recolours whatever is
  // painted, so it is NOT mutually exclusive with the context layers.
  const [colorblindRamp, setColorblindRamp] = useState(false);
  // Optional hazard overlay-share choropleth (bushfire / flood). Mutually
  // exclusive with the other context layers + the scored domain choropleth.
  const [hazardLayer, setHazardLayer] = useState<"bushfire" | "flood" | null>(null);
  const [recent, setRecent] = useState<RecentPlace[]>([]);
  const [savedChecks, setSavedChecks] = useState<SavedCheck[]>([]);

  // Tracks which interest view we last applied layer/confidence defaults for, so
  // weight edits (which change the URL) don't clobber the user's manual layer or
  // confidence-toggle choices. `null` means "not yet initialised".
  const appliedViewRef = useRef<InterestViewId | null>(null);

  useEffect(() => {
    const url = parseMapUrlState(searchParams.toString());
    const prefs = loadUserPrefs();
    setRecent(prefs.recent);
    setSavedChecks(prefs.savedChecks);
    setColorblindRamp(prefs.colorblindRamp ?? false);

    let w = url.weights
      ? mergeWeights(url.weights)
      : prefs.weights
        ? mergeWeights(prefs.weights)
        : getDefaultWeights();

    const viewId = url.view ?? prefs.interestView ?? "general";
    const view = INTEREST_VIEWS[viewId];
    if (view.weights && !url.weights) w = view.weights;

    setWeights(w);
    setShortlist(url.shortlist.length > 0 ? url.shortlist : prefs.shortlist);
    setInterestView(viewId);

    // Only (re)apply the view's default layer + confidence on first load or when
    // the view itself actually changes - never on plain weight/shortlist edits.
    if (appliedViewRef.current !== viewId) {
      appliedViewRef.current = viewId;
      setActiveDomain(view.defaultDomain);
      setConfidenceMode(view.confidenceMode);
      setWalkAccessMode(false);
      setCyclabilityMode(false);
      setHazardLayer(null);
      setSocialHousingMode(false);
    }

    // One-shot deep link (e.g. /?layer=transport from a profile metric card):
    // activate the requested choropleth domain. Only present when arriving via
    // such a link - plain weight/shortlist edits never carry it.
    if (url.layer) {
      setActiveDomain(url.layer);
      setConfidenceMode(false);
      setWalkAccessMode(false);
      setCyclabilityMode(false);
      setHazardLayer(null);
      setSocialHousingMode(false);
    }
  }, [searchParams]);

  // Context layers are mutually exclusive - only one choropleth basis at a time.
  const toggleConfidenceMode = useCallback(() => {
    setConfidenceMode((v) => {
      if (!v) {
        setWalkAccessMode(false);
        setCyclabilityMode(false);
        setHazardLayer(null);
        setSocialHousingMode(false);
      }
      return !v;
    });
  }, []);
  const toggleWalkAccessMode = useCallback(() => {
    setWalkAccessMode((v) => {
      if (!v) {
        setConfidenceMode(false);
        setCyclabilityMode(false);
        setHazardLayer(null);
        setSocialHousingMode(false);
      }
      return !v;
    });
  }, []);
  const toggleCyclabilityMode = useCallback(() => {
    setCyclabilityMode((v) => {
      if (!v) {
        setConfidenceMode(false);
        setWalkAccessMode(false);
        setHazardLayer(null);
        setSocialHousingMode(false);
      }
      return !v;
    });
  }, []);
  // Hazard overlay layer: pick bushfire/flood (toggles off if already active),
  // clearing the other mutually-exclusive context choropleths.
  const selectHazardLayer = useCallback((layer: "bushfire" | "flood") => {
    setHazardLayer((cur) => {
      const next = cur === layer ? null : layer;
      if (next) {
        setConfidenceMode(false);
        setWalkAccessMode(false);
        setCyclabilityMode(false);
        setSocialHousingMode(false);
      }
      return next;
    });
  }, []);

  const toggleSocialHousingMode = useCallback(() => {
    setSocialHousingMode((v) => {
      if (!v) {
        setConfidenceMode(false);
        setWalkAccessMode(false);
        setCyclabilityMode(false);
        setHazardLayer(null);
      }
      return !v;
    });
  }, []);

  // Display-only ramp swap; persisted device-local, kept out of the URL (an
  // accessibility preference, not a shareable view-state).
  const toggleColorblindRamp = useCallback(() => {
    setColorblindRamp((v) => {
      const next = !v;
      persistPrefs({ colorblindRamp: next });
      return next;
    });
  }, []);

  const replaceUrl = useCallback(
    (next: {
      weights: ScoreWeights;
      shortlist: string[];
      interestView: InterestViewId;
    }) => {
      const merged = mergeWeights(next.weights);
      router.replace(
        buildMapUrl("/", {
          weights: merged,
          shortlist: next.shortlist,
          view: next.interestView,
        }),
        { scroll: false }
      );
      persistPrefs({
        weights: merged,
        shortlist: next.shortlist,
        interestView: next.interestView,
      });
    },
    [router]
  );

  const setWeightsAndSync = useCallback(
    (w: ScoreWeights) => {
      const merged = mergeWeights(w);
      setWeights(merged);
      replaceUrl({ weights: merged, shortlist, interestView });
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
      replaceUrl({ weights: w, shortlist, interestView: id });
    },
    [replaceUrl, shortlist, weights]
  );

  const updateShortlist = useCallback((slugs: string[]) => {
    setShortlist(slugs);
    persistPrefs({ shortlist: slugs });
    replaceUrl({ weights, shortlist: slugs, interestView });
  }, [replaceUrl, weights, interestView]);

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

  const saveCheck = useCallback(
    (check: Parameters<typeof addSavedCheck>[0]) => {
      setSavedChecks(addSavedCheck(check).savedChecks);
    },
    []
  );
  const removeCheck = useCallback((id: string) => {
    setSavedChecks(removeSavedCheck(id).savedChecks);
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
    socialHousingMode,
    toggleSocialHousingMode,
    colorblindRamp,
    toggleColorblindRamp,
    hazardLayer,
    selectHazardLayer,
    recent,
    savedChecks,
    saveCheck,
    removeCheck,
    setWeightsAndSync,
    selectInterestView,
    updateShortlist,
    getShareUrl,
    noteRecentView,
    resetWeights: () => setWeightsAndSync(getDefaultWeights()),
  };
}

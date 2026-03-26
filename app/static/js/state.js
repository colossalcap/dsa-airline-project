/**
 * state.js — Centralized mutable application state.
 *
 * Every module reads/writes through this single object so that
 * reassignments (e.g. state.markers = []) are visible everywhere.
 */

export const state = {
    map: null,
    markers: [],
    routeLine: null,
    currentRoutesData: {},
    globalAirports: [],
    tempStartMarker: null,
    tempEndMarker: null,
    bfsMarkers: [],
    bfsCircles: [],
    activePanel: 'optimal',
    originalPanelForDetails: 'optimal',
    currentMultiCityRoute: null,
    multiCityMarkers: [],
    altRoutesData: [],
};

export const BFS_COLORS = {
    1: 'rgb(27, 103, 246)',
    2: 'rgb(34, 197, 94)',
    3: 'rgb(168, 85, 247)',
    4: 'rgb(255, 107, 0)'
};

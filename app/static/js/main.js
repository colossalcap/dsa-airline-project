/**
 * main.js — Application entry point.
 *
 * Imports every module, registers public functions on `window`
 * (for inline HTML onclick handlers), and runs initialization.
 */

import { state } from './state.js';

// --- Foundation imports ---
import { initMap, recenterMap, setMapSelection, clearMap } from './map.js';
import {
    setupDarkMode, switchPanel, clearAllInputs, hideError,
    collapsePanel, floatCardControl, setupInputListeners
} from './ui.js';

// --- Feature panel imports ---
import { queryShortestRoute } from './optimalRoute.js';
import { queryAlternativeRoutes, sortAltRoutes, selectAltRoute } from './altRoutes.js';
import { queryReachability, switchLevel } from './reachability.js';
import { queryMultiCity, addMultiCityStop, updateMultiCityMarkers } from './multiCity.js';
import { showRouteDetails, goBackFromDetails } from './routeDetails.js';

// ===================================================================
// REGISTER ON WINDOW — required for inline HTML onclick attributes
// ===================================================================
window.state = state;                                   // For inline onclick data refs

window.recenterMap = recenterMap;
window.setMapSelection = setMapSelection;

window.switchPanel = switchPanel;
window.clearAllInputs = clearAllInputs;
window.collapsePanel = collapsePanel;
window.floatCardControl = floatCardControl;

window.queryShortestRoute = queryShortestRoute;
window.queryAlternativeRoutes = queryAlternativeRoutes;
window.sortAltRoutes = sortAltRoutes;
window.selectAltRoute = selectAltRoute;

window.queryReachability = queryReachability;
window.switchLevel = switchLevel;

window.queryMultiCity = queryMultiCity;
window.addMultiCityStop = addMultiCityStop;
window.updateMultiCityMarkers = updateMultiCityMarkers;

window.showRouteDetails = showRouteDetails;
window.goBackFromDetails = goBackFromDetails;

// ===================================================================
// AIRPORT DATA LOADER
// ===================================================================
async function loadAirportOptions() {
    try {
        const res = await fetch('/api/airport_options');
        const data = await res.json();
        if (data.code === 1 && data.options) {
            state.globalAirports = data.options;

            const datalist = document.getElementById('airportList');
            data.options.forEach(ap => {
                const option = document.createElement('option');
                option.value = ap.text;
                datalist.appendChild(option);
            });
        }
    } catch (err) {
        console.error("Failed to load airports:", err);
    }
}

// ===================================================================
// INITIALIZATION
// ===================================================================
window.onload = async function () {
    initMap();
    setupDarkMode();
    await loadAirportOptions();
    setupInputListeners();
};

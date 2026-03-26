/**
 * utils.js — Pure utility / helper functions.
 *
 * These have no side-effects on application panels and never
 * import from ui.js or any panel module.
 */

import { state } from './state.js';

// ===== FADE OUT ANIMATION UTILITY =====
export function fadeOutAndRemove(layer) {
    if (!layer) return;

    try {
        if (typeof layer.getElement === 'function') {
            const el = layer.getElement();
            if (el && el.classList) el.classList.add('fade-out-layer');
        }

        if (layer._icon && layer._icon.classList) layer._icon.classList.add('fade-out-layer');
        if (layer._shadow && layer._shadow.classList) layer._shadow.classList.add('fade-out-layer');

        if (typeof layer.eachLayer === 'function') {
            layer.eachLayer(subLayer => {
                if (typeof subLayer.getElement === 'function') {
                    const subEl = subLayer.getElement();
                    if (subEl && subEl.classList) subEl.classList.add('fade-out-layer');
                }
            });
        }
    } catch (e) {
        console.warn("Could not apply fade animation, layer will be removed normally.", e);
    }

    setTimeout(() => {
        if (state.map && state.map.hasLayer(layer)) {
            state.map.removeLayer(layer);
        }
    }, 300);
}

// ===== LOADING BAR UTILITY =====
export function showLoading(panelId, message) {
    const bar = document.getElementById(panelId + '-loading');
    if (bar) {
        bar.querySelector('.loading-text').textContent = message;
        bar.style.display = 'flex';
    }
}

export function hideLoading(panelId) {
    const bar = document.getElementById(panelId + '-loading');
    if (bar) bar.style.display = 'none';
}

// ===== IATA / AIRPORT HELPERS =====
export function extractIATA(str) {
    if (!str) return "";
    const match = str.match(/\(([A-Z]{3})\)/);
    if (match) return match[1];

    // If it's already a 3-letter uppercase string, assume it's an IATA
    if (str.length === 3 && /^[A-Z]+$/.test(str)) return str;

    // Last resort: check if it matches a known airport text
    const found = state.globalAirports.find(ap => ap.text === str);
    if (found) return found.value;

    return str.substring(0, 3).toUpperCase();
}

export function extractAirportName(str) {
    const parts = str.split(") - ");
    return parts[1] || str;
}

// ===== MATH HELPERS =====
export function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function formatTime(totalMinutes) {
    if (!totalMinutes) return '0h 0m';
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${m}m`;
}

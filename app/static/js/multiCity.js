/**
 * multiCity.js — Panel 4: Multi-city planner.
 */

import { state } from './state.js';
import { fadeOutAndRemove, showLoading, hideLoading, extractIATA } from './utils.js';
import { clearMap, renderMap } from './map.js';

// ===== Error helpers =====
export function showMultiCityError(msg) {
    const el = document.getElementById('multiCityErrorMsg');
    if (el) {
        el.innerText = msg;
        el.style.display = 'block';
    }
    const area = document.getElementById('multiCityResultArea');
    if (area) area.style.display = 'none';
}

export function hideMultiCityError() {
    const el = document.getElementById('multiCityErrorMsg');
    if (el) el.style.display = 'none';
}

// ===== Markers preview =====
export function updateMultiCityMarkers() {
    state.multiCityMarkers.forEach(fadeOutAndRemove);
    state.multiCityMarkers = [];

    if (state.routeLine) {
        fadeOutAndRemove(state.routeLine);
        state.routeLine = null;
    }
    state.markers.forEach(fadeOutAndRemove);
    state.markers = [];

    const inputs = document.querySelectorAll('.multi-city-input');
    const allCoords = [];

    inputs.forEach((input, idx) => {
        const val = input.value.trim();
        if (!val) return;

        const matchedAirport = state.globalAirports.find(ap => ap.text === val);
        if (!matchedAirport || !matchedAirport.lat || !matchedAirport.lng) return;

        const lat = matchedAirport.lat;
        const lng = matchedAirport.lng;
        allCoords.push([lat, lng]);

        const stopNumber = idx + 1;
        const isFirst = idx === 0;
        const isLast = idx === inputs.length - 1 && val;

        let bg = '#3b82f6';
        if (isFirst) bg = '#22c55e';
        else if (isLast) bg = '#ef4444';

        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                html: `<div class="premium-marker" style="background: ${bg}; color: white; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); width: 34px; height: 34px; display:flex; align-items:center; justify-content:center; border-radius:50%; font-weight:bold; font-size:16px; margin-top:-17px; margin-left:-17px; z-index: 500;">${stopNumber}</div>`,
                className: ''
            })
        }).addTo(state.map).bindPopup(`<b>${matchedAirport.text}</b><br>Stop ${stopNumber}`);

        state.multiCityMarkers.push(marker);
    });

    if (allCoords.length > 1) {
        state.map.fitBounds(allCoords, { padding: [60, 60] });
    } else if (allCoords.length === 1) {
        state.map.flyTo(allCoords[0], 5, { duration: 1.5 });
    }
}

// ===== Add stop input =====
export function addMultiCityStop() {
    const container = document.getElementById('multiCityInputsContainer');
    const stopCount = container.querySelectorAll('.input-item').length + 1;

    if (stopCount > 8) {
        showMultiCityError("Maximum 8 stops allowed.");
        return;
    }

    const div = document.createElement('div');
    div.className = 'input-item';
    div.innerHTML = `
        <label>Stop ${stopCount} (Optional)</label>
        <div class="list">
            <i class="fa fa-map-marker"></i>
            <input type="text" class="multi-city-input" list="airportList" autocomplete="off" placeholder="City or Airport">
            <i class="fa fa-chevron-down"></i>
        </div>
    `;
    container.appendChild(div);

    // Attach listener to the new input
    const newInput = div.querySelector('input');
    if (newInput) {
        newInput.addEventListener('input', updateMultiCityMarkers);
    }
}

// ===== Query API =====
export async function queryMultiCity() {
    hideMultiCityError();
    clearMap();

    const inputs = document.querySelectorAll('.multi-city-input');
    const itinerary = [];

    inputs.forEach(input => {
        const val = input.value.trim();
        if (val) {
            itinerary.push(extractIATA(val));
        }
    });

    if (itinerary.length < 2) {
        showMultiCityError("Please enter at least 2 valid airports.");
        return;
    }

    showLoading('multicity', `Planning multi-city route for ${itinerary.length} stops...`);

    try {
        const res = await fetch('/api/multi_city', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itinerary })
        });
        const data = await res.json();

        hideLoading('multicity');

        // 1. SAVE the route data globally so our button can use it!
        state.currentMultiCityRoute = data.route;

        renderMap(data.route);

        const area = document.getElementById('multiCityResultArea');
        if (area) {
            const { path, total_time, total_distance, total_price, requested_stops } = data.route;
            const hour = Math.floor(total_time / 60);
            const min = total_time % 60;

            let pathHtml = '';
            let currentLegPath = [];
            let reqStopTargetIndex = 1;
            let legCount = 1;

            path.forEach((iata) => {
                currentLegPath.push(iata);

                if (requested_stops && reqStopTargetIndex < requested_stops.length && iata === requested_stops[reqStopTargetIndex]) {
                    let start = currentLegPath[0];
                    let end = currentLegPath[currentLegPath.length - 1];
                    let layovers = currentLegPath.slice(1, -1);

                    pathHtml += `<div style="margin-bottom: 8px; padding: 10px; border-radius: 6px; border: 1px solid rgba(148, 163, 184, 0.2);">`;
                    pathHtml += `<div style="font-weight: 800; font-size: 14px; margin-bottom: 4px;">Leg ${legCount}: <span style="color: #22c55e;">${start}</span> <i class="fa fa-long-arrow-right" style="color: #94a3b8; margin: 0 5px;"></i> <span style="color: #3b82f6;">${end}</span></div>`;

                    if (layovers.length > 0) {
                        pathHtml += `<div style="font-size: 12px; color: #64748b; margin-top: 4px;"><i class="fa fa-circle-o" style="margin-right:4px;"></i> Layovers: ${layovers.join(' &rarr; ')}</div>`;
                    } else {
                        pathHtml += `<div style="font-size: 12px; color: #10b981; margin-top: 4px;"><i class="fa fa-bolt" style="margin-right:4px;"></i> Direct Flight</div>`;
                    }
                    pathHtml += `</div>`;

                    currentLegPath = [iata];
                    reqStopTargetIndex++;
                    legCount++;
                }
            });

            if (pathHtml === '') {
                pathHtml = `<div style="margin-bottom: 8px; font-size: 14px; text-align: left;">${path.join(' &rarr; ')}</div>`;
            }

            area.innerHTML = `
                <div class="result-card selected" style="border-left: 5px solid #1B67F6; padding: 15px; border-radius: 8px; text-align: left; margin: 0;">
                    
                    <div class="first" style="display:none;"><div class="title">Multi-City Planner</div></div>
                    
                    <div style="font-size: 16px; font-weight: 800; margin-bottom: 12px; text-align: center;"><i class="fa fa-ticket"></i> Multi-City Itinerary</div>
                    
                    ${pathHtml}
                    
                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed rgba(148, 163, 184, 0.3); display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="margin-bottom: 4px; font-size: 13px; color: #94a3b8;"><b>Total Distance:</b> ${total_distance.toLocaleString()} km</div>
                            <div style="font-size: 13px; color: #94a3b8;"><b>Total Airtime:</b> ${hour}h ${min}m</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: bold;">Est. Price</div>
                            <div style="color: #10B981; font-weight: 900; font-size: 20px;">$${total_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                    </div>
                    
                    <div class="action-buttons" style="margin-top: 15px; display: block;">
                        <button class="search-btn showDetails" onclick="showRouteDetails(state.currentMultiCityRoute, 'panel-multicity')" style="width: 100%; height: 40px;">
                            <i class="fa fa-list"></i> More Details
                        </button>
                    </div>
                </div>
            `;
            area.style.display = 'block';

            // SYNC with floating box
            const floatContainer = document.querySelector('div[value="panel-multicity"].floating .box');
            if (floatContainer) {
                floatContainer.innerHTML = '';
                const cardClone = area.querySelector('.result-card').cloneNode(true);
                floatContainer.appendChild(cardClone);
                
                // Attach click listener to the details button in the floating version
                const floatDetailsBtn = cardClone.querySelector('.showDetails');
                if (floatDetailsBtn) {
                    floatDetailsBtn.onclick = function() {
                        if (window.showRouteDetails) window.showRouteDetails(state.currentMultiCityRoute, 'panel-multicity');
                    };
                }
            }
        }

    } catch (err) {
        hideLoading('multicity');
        showMultiCityError(`Script Error: ${err.message}`);
        console.error(err);
    }
}

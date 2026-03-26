/**
 * routeDetails.js — Panel 5: Detailed route timeline view.
 */

import { state } from './state.js';
import { getDistanceFromLatLonInKm, formatTime } from './utils.js';
import { renderMap } from './map.js';

export function goBackFromDetails() {
    const targetPanel = state.originalPanelForDetails.replace('panel-', '');
    window.switchPanel(targetPanel, true); // skipClear = true
}

export function showRouteDetails(routeData, originPanelId) {
    if (!window.switchPanel) { console.error('switchPanel not defined'); return; }

    // Store origin panel if provided (from button click)
    if (originPanelId) state.originalPanelForDetails = originPanelId;

    window.switchPanel('details');
    const area = document.getElementById('detailsArea');
    if (!area) return;

    // The data might have different keys depending on where it came from
    const nodes = routeData.path || routeData.path_nodes || [];
    const price = routeData.total_price || routeData.price || 0;
    const distTotal = routeData.total_distance || 0;
    const timeTotal = routeData.total_time || 0;
    const distances = routeData.distances || [];
    const pathNames = routeData.path_names || [];

    if (nodes.length === 0) {
        area.innerHTML = '<p style="padding: 20px; text-align: center;">No route data available.</p>';
        return;
    }

    let timelineHtml = '<div class="timeline">';
    for (let i = 0; i < nodes.length; i++) {
        const airportCode = nodes[i];
        const airport = state.globalAirports.find(ap => ap.text && ap.text.includes(`(${airportCode})`)) || null;

        // Fallback to path_names if airportData is missing
        const name = (pathNames[i] || (airport ? airport.text : airportCode));
        const cityStr = (airport && airport.city && airport.city !== 'Unknown') ? `${airport.city}${airport.country ? ', ' + airport.country : ''}` : '';

        const isFirst = (i === 0);
        const isLast = (i === nodes.length - 1);

        // Check if this specific airport was one of the user's requested multi-city stops
        const isRequestedStop = routeData.requested_stops && routeData.requested_stops.includes(airportCode);

        // Make requested stops use the 'destination' class so they look like main hubs, not tiny layovers
        const itemClass = isFirst ? 'origin' : ((isLast || isRequestedStop) ? 'destination' : 'layover');

        // Add a green "STOP X" badge for the requested waypoints to match the map numbers
        let stopBadge = '';
        if (isRequestedStop && !isFirst && !isLast) {
            const stopNumber = routeData.requested_stops.indexOf(airportCode) + 1;
            stopBadge = `<span style="background: #10B981; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; margin-right: 8px; vertical-align: middle;">STOP ${stopNumber}</span>`;
        }

        timelineHtml += `
            <div class="timeline-item ${itemClass}">
                <div class="timeline-marker"></div>
                <div class="timeline-content">
                    <span class="timeline-airport" style="line-height: 1.2; display: block; margin-bottom: 2px;">
                        ${stopBadge}${name}
                    </span>
                    ${cityStr ? `<span class="timeline-city">${cityStr}</span>` : ''}
                </div>
            </div>
        `;

        if (!isLast) {
            let distVal = 'N/A';
            if (distances[i]) {
                distVal = distances[i].toFixed(2);
            } else {
                // Try to find lat/lng for calculation
                const ap1 = state.globalAirports.find(ap => ap.text && ap.text.includes(`(${nodes[i]})`)) || null;
                const ap2 = state.globalAirports.find(ap => ap.text && ap.text.includes(`(${nodes[i + 1]})`)) || null;

                if (ap1 && ap2 && ap1.lat && ap1.lng && ap2.lat && ap2.lng) {
                    distVal = getDistanceFromLatLonInKm(ap1.lat, ap1.lng, ap2.lat, ap2.lng).toFixed(2);
                } else if (routeData.coords && routeData.coords[nodes[i]] && routeData.coords[nodes[i + 1]]) {
                    const c1 = routeData.coords[nodes[i]];
                    const c2 = routeData.coords[nodes[i + 1]];
                    distVal = getDistanceFromLatLonInKm(c1[0], c1[1], c2[0], c2[1]).toFixed(2);
                }
            }

            timelineHtml += `
                <div class="timeline-leg-info">
                    <span><i class="fa fa-plane"></i> Leg ${i + 1}</span>
                    <span><strong>${distVal} km</strong></span>
                </div>
            `;
        }
    }
    timelineHtml += '</div>';

    // First, calculate the layovers
    const layoverCount = nodes.length - 2;
    const layoverText = layoverCount <= 0 ? 'Direct Flight' : `${layoverCount} Stop${layoverCount > 1 ? 's' : ''}`;

    area.innerHTML = `
        <div class="details-summary" style="padding: 16px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; border-bottom: 1px solid rgba(148, 163, 184, 0.2); padding-bottom: 12px;">
                <div>
                    <span style="display: block; font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Flight Path</span>
                    <span style="font-weight: 800; font-size: 18px;"><i class="fa fa-plane-departure" style="color: #1B67F6; margin-right: 6px;"></i> ${nodes[0]} → ${nodes[nodes.length - 1]}</span>
                </div>
                <div style="text-align: right;">
                    <span style="display: block; font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Total Price</span>
                    <span style="color: #10B981; font-weight: 800; font-size: 18px;">$${price.toFixed(2)}</span>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; font-size: 14px;">
                <div>
                    <span style="display: block; font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">Total Distance</span>
                    <div style="display: flex; align-items: center; gap: 6px; font-weight: 600;">
                        <i class="fa fa-route" style="color: #1B67F6;"></i>
                        <span>${distTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km</span>
                    </div>
                </div>
                <div>
                    <span style="display: block; font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">Total Time</span>
                    <div style="display: flex; align-items: center; gap: 6px; font-weight: 600;">
                        <i class="fa fa-clock-o" style="color: #1B67F6;"></i>
                        <span>${formatTime(timeTotal)}</span>
                    </div>
                </div>
                <div>
                    <span style="display: block; font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">Layovers</span>
                    <div style="display: flex; align-items: center; gap: 6px; font-weight: 600;">
                        <i class="fa fa-exchange" style="color: #1B67F6;"></i>
                        <span>${layoverText}</span>
                    </div>
                </div>
            </div>
        </div>
        ${timelineHtml}
    `;

    renderMap(routeData);

    const floatPanel = document.querySelector('div[value="panel-details"].floating');
    if (floatPanel) {
        // Try to FIND the original card to copy its header (title and badges)
        const originPanel = document.getElementById(state.originalPanelForDetails);
        let headerHtml = `<span style="font-weight: 800; font-size: 1.4rem;">Detail Route</span>`;
        if (originPanel) {
            const selectedCard = originPanel.querySelector('.result-card.selected');
            if (selectedCard) {
                const title = selectedCard.querySelector('.title') ? selectedCard.querySelector('.title').innerHTML : 'Detail Route';
                const type = selectedCard.querySelector('.type') ? selectedCard.querySelector('.type').innerHTML : '';
                headerHtml = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2px;">
                        <span style="font-weight: 800; font-size: 1.4rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${title}</span>
                        <div class="type">${type}</div>
                    </div>
                 `;
            }
        }

        floatPanel.querySelector('.box').innerHTML = `
            <div class="result-card active selected" style="margin: 0; width: 100%; box-shadow: none; border: none;">
                ${headerHtml}
                <div style="font-size: 13px; color: #64748b; margin-bottom: 8px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${nodes.join(' → ')}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div>
                        <span style="font-size: 1.2rem; font-weight: 900; color: #1B67F6;">$${price.toFixed(2)}</span>
                    </div>
                    <div>
                        <span style="font-size: 1.1rem; font-weight: 700;">${distTotal.toFixed(2)} km</span>
                    </div>
                </div>
                <button class="search-btn is-details-indicator" disabled style="width: 100%; height: 36px; font-size: 13px; border-radius: 10px; background: rgba(148, 163, 184, 0.2); border: 1px solid rgba(148, 163, 184, 0.3); color: inherit; opacity: 1 !important;">
                     Viewing More Details
                </button>
            </div>
        `;

        // Sync the arrow cards
        const boxContainer = floatPanel.querySelector('.box');
        const originMainPanel = document.getElementById(state.originalPanelForDetails);

        if (originMainPanel) {
            const sideCards = originMainPanel.querySelectorAll('.result-card');
            if (sideCards.length > 0) {
                boxContainer.innerHTML = '';
                sideCards.forEach((c) => {
                    const clone = c.cloneNode(true);
                    // Ensure clone respects dark mode background (remove ad-hoc background style)
                    clone.style.background = '';
                    boxContainer.appendChild(clone);
                });

                const cards = boxContainer.querySelectorAll('.result-card');
                // Find which one is selected
                const selectedIndex = Array.from(sideCards).findIndex(c => c.classList.contains('selected'));

                cards.forEach((c, idx) => {
                    // Grab the buttons directly instead of changing their base classes
                    const detailsBtn = c.querySelector('.showDetails');
                    const mapBtn = c.querySelector('.showRoute');

                    if (idx === selectedIndex || (selectedIndex === -1 && idx === 0)) {
                        c.classList.add('active', 'selected');

                        if (detailsBtn) {
                            detailsBtn.innerText = "Viewing More Details";
                            // Make it look like a seamless disabled button
                            detailsBtn.style.background = "rgba(148, 163, 184, 0.2)";
                            detailsBtn.style.color = "#94a3b8";
                            detailsBtn.style.border = "1px solid rgba(148, 163, 184, 0.1)";
                            detailsBtn.style.cursor = "default";
                            detailsBtn.style.pointerEvents = "none";
                            detailsBtn.style.width = "100%";
                            detailsBtn.style.justifyContent = "center";
                        }
                        if (mapBtn) {
                            // Hide the map button on the active card so 'Viewing More Details' gets the full width
                            mapBtn.style.display = "none";
                        }
                    } else {
                        c.classList.remove('active', 'selected');

                        // Re-attach the click events to the cloned buttons
                        if (detailsBtn) {
                            detailsBtn.style.cursor = "pointer";
                            detailsBtn.onclick = function () {
                                if (originMainPanel) {
                                    const realCards = originMainPanel.querySelectorAll('.result-card');
                                    if (realCards[idx]) {
                                        const realBtn = realCards[idx].querySelector('.showDetails');
                                        if (realBtn) realBtn.click();
                                    }
                                }
                            };
                        }
                        if (mapBtn) {
                            mapBtn.style.cursor = "pointer";
                            mapBtn.onclick = function () {
                                if (originMainPanel) {
                                    const realCards = originMainPanel.querySelectorAll('.result-card');
                                    if (realCards[idx]) {
                                        const realBtn = realCards[idx].querySelector('.showRoute');
                                        if (realBtn) realBtn.click();
                                    }
                                }
                            };
                        }
                    }
                });
                // Arrow hiding logic — if only 1 card, hide navigation arrows
                const leftArrow = floatPanel.querySelector('.button.left');
                const rightArrow = floatPanel.querySelector('.button.right');

                if (sideCards.length <= 1) {
                    if (leftArrow) leftArrow.style.display = 'none';
                    if (rightArrow) rightArrow.style.display = 'none';
                } else {
                    if (leftArrow) leftArrow.style.display = '';
                    if (rightArrow) rightArrow.style.display = '';
                }
            }
        }

        // Activate floating if panel is currently hidden
        const btn = document.querySelector('div[value="panel-details"].collapseBtn');
        if (btn && btn.classList.contains('expand')) {
            floatPanel.classList.add('active');
        }
    }
}

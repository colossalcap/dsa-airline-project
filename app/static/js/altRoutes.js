/**
 * altRoutes.js — Panel 2: Yen's alternative routes.
 */

import { state } from './state.js';
import { fadeOutAndRemove, showLoading, hideLoading, extractIATA } from './utils.js';
import { clearMap, renderMap } from './map.js';

// ===== Error helpers =====
export function showAltError(msg) {
    const el = document.getElementById('altErrorMsg');
    if (el) {
        el.innerText = msg;
        el.style.display = 'block';
    }
    const area = document.getElementById('altResultArea');
    if (area) area.style.display = 'none';
}

export function hideAltError() {
    const el = document.getElementById('altErrorMsg');
    if (el) el.style.display = 'none';
}

// ===== Query API =====
export async function queryAlternativeRoutes() {
    hideAltError();
    clearMap();

    const startRaw = document.getElementById('altStart').value;
    const endRaw = document.getElementById('altEnd').value;
    const maxConn = document.getElementById('maxConnections').value;

    if (!startRaw || !endRaw) {
        showAltError('Please select both airports!');
        return;
    }

    const start = extractIATA(startRaw);
    const end = extractIATA(endRaw);

    showLoading('alt', `Running Yen's Algorithm: ${start} → ${end} ...`);
    document.getElementById('altResultArea').style.display = 'none';

    try {
        const res = await fetch('/api/alternative_routes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start, end, max_connections: parseInt(maxConn) })
        });
        const data = await res.json();

        hideLoading('alt');

        if (data.code === 0) {
            showAltError(data.msg);
            return;
        }

        state.altRoutesData = data.routes;
        document.getElementById('altResultArea').style.display = 'block';
        document.getElementById('altSummary').innerHTML =
            `🔍 Found <strong>${data.count}</strong> alternative route${data.count > 1 ? 's' : ''} (max ${maxConn} flights)`;

        document.querySelector(".tab-btn.cheapest").click();

    } catch (err) {
        hideLoading('alt');
        showAltError(`Script Error: ${err.message}`);
        console.error(err);
    }
}

// ===== Sort & Render =====
export function sortAltRoutes(value, element) {
    const buttons = document.querySelectorAll('.alt-sort-controls .tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    element.classList.add('active');

    if (value === 'cheapest') {
        state.altRoutesData.sort((a, b) => a.total_price - b.total_price);
    } else if (value === 'fastest') {
        state.altRoutesData.sort((a, b) => a.total_time - b.total_time);
    } else if (value === 'shortest') {
        state.altRoutesData.sort((a, b) => a.total_distance - b.total_distance);
    } else if (value === 'fewest') {
        state.altRoutesData.sort((a, b) => a.path.length - b.path.length);
    }
    renderAltRoutesList();
    if (state.altRoutesData.length > 0) {
        selectAltRoute(0);
    }
}

export function renderAltRoutesList() {
    const container = document.getElementById('altRoutesList');
    if (!container) return;
    container.innerHTML = '';

    const floatContainer = document.querySelector('div[value="panel-alternatives"] .box');
    if (floatContainer) floatContainer.innerHTML = '';

    const minPrice = Math.min(...state.altRoutesData.map(r => r.total_price));
    const minTime = Math.min(...state.altRoutesData.map(r => r.total_time));
    const minDistance = Math.min(...state.altRoutesData.map(r => r.total_distance));
    const minStops = Math.min(...state.altRoutesData.map(r => r.path.length));

    state.altRoutesData.forEach((route, idx) => {
        const card = document.createElement('div');
        card.classList.add('alt-route-card', 'result-card');
        card.dataset.index = idx;
        let typeHTML = "";

        const flights = route.path.length - 2;
        const hours = Math.floor(route.total_time / 60);
        const mins = route.total_time % 60;

        if (route.total_price === minPrice) {
            card.classList.add("cheapest");
            typeHTML += `<div class="cheapest"></div>`
        }
        if (route.total_time === minTime) {
            card.classList.add("fastest");
            typeHTML += `<div class="fastest"></div>`
        }
        if (route.total_distance === minDistance) {
            card.classList.add("shortest");
            typeHTML += `<div class="shortest"></div>`
        }
        if (route.path.length === minStops) {
            card.classList.add("fewest");
            typeHTML += `<div class="fewest"></div>`
        }

        card.innerHTML = `
            <div class="first"><div class="title">Route ${idx + 1}</div><div class="type">${typeHTML}</div></div>
            <div class="second"><div class="path">${route.path.join(' → ')}</div><div class="stops">${flights <= 0 ? 'Direct' : `${flights} stop${flights > 1 ? 's' : ''}`}</div><div class="time">${hours}h ${mins}m</div></div>
            <div class="third"><div class="price">$${route.total_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <div class="distance">${route.total_distance.toLocaleString()} km</div></div>
            <div class="action-buttons">
                <div class="showRoute" onclick="selectAltRoute(${idx})">Show on Map</div>
                <div class="showDetails" onclick="showRouteDetails(state.altRoutesData[${idx}], 'panel-alternatives')">More Details</div>
            </div>
        `;

        container.appendChild(card);
        const cardClone = card.cloneNode(true);
        if (floatContainer) floatContainer.appendChild(cardClone);
    });
}

export function selectAltRoute(index) {
    document.querySelectorAll('.alt-route-card').forEach(c => c.classList.remove('selected'));
    const selectedCard = document.querySelector(`.alt-route-card[data-index="${index}"]`);
    if (selectedCard) selectedCard.classList.add('selected');

    const route = state.altRoutesData[index];
    if (!route) return;

    if (state.routeLine) fadeOutAndRemove(state.routeLine);
    state.markers.forEach(fadeOutAndRemove);
    state.markers = [];

    const mapData = {
        path: route.path,
        path_names: route.path_names,
        coords: route.coords,
        total_distance: route.total_distance,
        total_price: route.total_price
    };

    renderMap(mapData);
}

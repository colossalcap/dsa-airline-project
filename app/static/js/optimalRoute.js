/**
 * optimalRoute.js — Panel 1: Dijkstra optimal route search.
 */

import { state } from './state.js';
import { fadeOutAndRemove, showLoading, hideLoading, extractIATA } from './utils.js';
import { clearMap, renderMap } from './map.js';
import { showError, hideError } from './ui.js';

export async function queryShortestRoute() {
    hideError();

    const startRaw = document.getElementById('startAirport').value;
    const endRaw = document.getElementById('endAirport').value;

    if (!startRaw || !endRaw) {
        showError('Please select both airports!');
        return;
    }

    const start = extractIATA(startRaw);
    const end = extractIATA(endRaw);

    showLoading('optimal', `Running Dijkstra's Algorithm: ${start} → ${end} ...`);

    try {
        const res = await fetch('/api/get_shortest_route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start, end })
        });
        const data = await res.json();

        hideLoading('optimal');

        if (data.code === 0) {
            showError(data.msg);
            return;
        }

        clearMap();

        state.currentRoutesData = data.routes;
        generateDynamicTabs();

        document.getElementById('resultCard').style.display = 'block';

    } catch (err) {
        hideLoading('optimal');
        showError(`Script Error: ${err.message}`);
        console.error(err);
    }
}

function generateDynamicTabs() {
    const uniquePaths = {};
    const criteriaNames = {
        'price': 'cheapest',
        'time': 'fastest',
        'distance': 'shortest',
        'connections': 'fewest'
    };

    for (const crit of ['price', 'time', 'distance', 'connections']) {
        const route = state.currentRoutesData[crit];
        if (!route) continue;
        const pathStr = route.path.join(',');

        if (!uniquePaths[pathStr]) {
            uniquePaths[pathStr] = { criterias: [crit], routeData: route };
        } else {
            uniquePaths[pathStr].criterias.push(crit);
        }
    }

    const bestBadge = document.getElementById('bestOverallBadge');
    const allRoutesContainer = document.getElementById('result-box');
    const floatContainer = document.querySelector('div[value="panel-optimal"].floating .box');
    floatContainer.innerHTML = '';
    allRoutesContainer.innerHTML = '';
    const pathKeys = Object.keys(uniquePaths);

    if (pathKeys.length === 1) {
        if (bestBadge) bestBadge.style.display = 'block';
        const singlePath = uniquePaths[pathKeys[0]];
        createRouteCard(singlePath, 'Best Route', allRoutesContainer, criteriaNames);
        createRouteCard(singlePath, 'Best Route', floatContainer, criteriaNames);
    } else {
        if (bestBadge) bestBadge.style.display = 'none';
        pathKeys.forEach((pathKey, index) => {
            const pathData = uniquePaths[pathKey];
            const cardTitle = `Route ${index + 1}`;
            createRouteCard(pathData, cardTitle, allRoutesContainer, criteriaNames);
            createRouteCard(pathData, cardTitle, floatContainer, criteriaNames);
        });
    }

    if (pathKeys.length > 0) {
        const firstRouteData = uniquePaths[pathKeys[0]].routeData;
        if (state.routeLine) fadeOutAndRemove(state.routeLine);
        state.markers.forEach(fadeOutAndRemove);
        state.markers = [];
        renderMap(firstRouteData);
        document.querySelector('.result-card').classList.add('selected');
    }
}

function createRouteCard(pathData, cardTitle, container, criteriaNames) {
    if (!container || !pathData || !pathData.routeData) return;

    const routeData = pathData.routeData;
    const stops = routeData.path.length - 2;
    const hour = Math.floor(routeData.total_time / 60);
    const min = routeData.total_time % 60;

    const typeHTML = pathData.criterias.map(crit => `
        <div class="${criteriaNames[crit]}"></div>
    `).join('');

    const cardClasses = ['result-card'].concat(pathData.criterias.map(c => criteriaNames[c])).join(' ');

    const cardHTML = `
        <div class="${cardClasses}">
            <div class="first">
                <div class="title">${cardTitle}</div>
                <div class="type">${typeHTML}</div>
            </div>
            
            <div class="second">
                <div class="path">${routeData.path.join(' → ')}</div>
                <div class="stops">${stops <= 0 ? 'Direct' : `${stops} stop${stops > 1 ? 's' : ''}`}</div>
                <div class="time">${hour}h ${min}m</div>
            </div>

            <div class="third">
                <div class="price">$${routeData.total_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div class="distance">${routeData.total_distance.toLocaleString()} km</div>
            </div>
            
            <div class="action-buttons">
                <div class="showRoute">Show on Map</div>
                <div class="showDetails">More Details</div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', cardHTML);

    const cardElement = container.lastElementChild;
    const showMapBtn = cardElement.querySelector('.showRoute');
    const showDetailsBtn = cardElement.querySelector('.showDetails');

    showMapBtn.addEventListener('click', () => {
        if (state.routeLine) fadeOutAndRemove(state.routeLine);
        state.markers.forEach(fadeOutAndRemove);
        state.markers = [];
        renderMap(routeData);

        document.querySelectorAll('.result-card').forEach(card => {
            card.classList.remove('selected');
        });
        cardElement.classList.add('selected');
    });

    showDetailsBtn.addEventListener('click', () => {
        if (window.showRouteDetails) window.showRouteDetails(routeData, 'panel-optimal');
    });
}

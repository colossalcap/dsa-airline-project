/**
 * reachability.js — Panel 3: BFS reachability map.
 */

import { state, BFS_COLORS } from './state.js';
import { showLoading, hideLoading, extractIATA, extractAirportName } from './utils.js';
import { clearMap } from './map.js';

// ===== Error helpers =====
export function showBfsError(msg) {
    const el = document.getElementById('bfsErrorMsg');
    if (el) {
        el.innerText = msg;
        el.style.display = 'block';
    }
    const area = document.getElementById('bfsResultArea');
    if (area) area.style.display = 'none';
}

export function hideBfsError() {
    const el = document.getElementById('bfsErrorMsg');
    if (el) el.style.display = 'none';
}

// ===== Query API =====
export async function queryReachability() {
    hideBfsError();
    clearMap();

    const startRaw = document.getElementById('bfsStart').value;
    const maxStops = document.getElementById('maxStops').value;

    if (!startRaw) {
        showBfsError('Please select a starting airport!');
        return;
    }

    const start = extractIATA(startRaw);

    showLoading('bfs', `Running BFS from ${start} (max ${maxStops} flights) ...`);
    document.getElementById('bfsResultArea').style.display = 'none';

    try {
        const res = await fetch('/api/reachability', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start, max_stops: parseInt(maxStops) })
        });
        const data = await res.json();

        hideLoading('bfs');

        if (data.code === 0) {
            showBfsError(data.msg);
            return;
        }

        document.getElementById('bfsResultArea').style.display = 'block';
        document.querySelector(".bfsControls .level-1").classList.add("selected");

        let totalCount = 0;
        for (const level in data.reachable) {
            totalCount += data.reachable[level].length;
        }

        document.getElementById('bfsSummary').innerHTML =
            `🌍 <strong>${totalCount}</strong> airports reachable from <strong>${data.start}</strong> within ${maxStops} flight${maxStops > 1 ? 's' : ''}`;

        renderBfsLevels(data.reachable);
        renderBfsMap(data);

    } catch (err) {
        hideLoading('bfs');
        showBfsError(`Script Error: ${err.message}`);
        console.error(err);
    }
}

// ===== Render =====
function renderBfsLevels(reachable) {
    const container = document.getElementById('bfsLevelList');
    const airport = extractAirportName(document.getElementById('bfsStart').value);
    container.innerHTML = '';

    const floatContainer = document.querySelector("div[value=panel-reachability].floating .box");
    if (floatContainer) floatContainer.innerHTML = '';

    const levelLabels = {
        1: 'Direct',
        2: '1 Stop',
        3: '2 Stops',
        4: '3 Stops'
    };

    document.querySelectorAll('.bfsControls div').forEach(p => p.style.display = "none");
    for (const level of Object.keys(reachable).sort()) {
        const controlBtn = document.querySelector(`.bfsControls .level-${level}`);
        if (controlBtn) controlBtn.style.display = "block";

        const airports = reachable[level];
        const group = document.createElement('div');
        group.classList.add('bfsGroup', `level-${level}`);

        const floatGroup = document.createElement('div');
        floatGroup.classList.add('result-card', `level-${level}`);

        const header = document.createElement('div');
        header.className = `title`;
        header.innerHTML = `${levelLabels[level]} flights from <span>${airport}</span>`;
        group.appendChild(header);

        const headerClone = header.cloneNode(true);
        floatGroup.appendChild(headerClone);

        const list = document.createElement('div');
        list.className = 'bfs-airport-list';

        airports.forEach(ap => {
            const chip = document.createElement('span');
            chip.className = 'bfs-airport-chip';

            chip.textContent = ap.iata;
            chip.title = `${ap.name} (Click to route)`;
            chip.onclick = () => {
                handleBfsChipClick(ap.iata, ap.name);
            };
            list.appendChild(chip);
        });
        group.appendChild(list);

        const floatList = document.createElement('div');
        floatList.className = 'bfs-airport-list';

        airports.forEach(ap => {
            const chip = document.createElement('span');
            chip.className = 'bfs-airport-chip';
            chip.textContent = ap.iata;
            chip.title = ap.name;
            chip.onclick = () => {
                const coords = ap.coords;
                if (coords && coords[0] !== 0 && coords[1] !== 0) {
                    state.map.flyTo([coords[0], coords[1]], 6, { duration: 1.0 });
                }
            };
            floatList.appendChild(chip);
        });
        floatGroup.appendChild(floatList);

        const footer = document.createElement('div');
        footer.className = `total`;
        footer.textContent = `Total: ${airports.length} ${level > 1 ? '' : 'direct '}airport${airports.length > 1 ? 's' : ''} ${level > 1 ? 'with ' + levelLabels[level] : ''}`;
        group.appendChild(footer);
        const footerClone = footer.cloneNode(true);
        floatGroup.appendChild(footerClone);

        container.appendChild(group);
        if (floatContainer) floatContainer.appendChild(floatGroup);
    }
}

function handleBfsChipClick(endIata, endName) {
    const startRaw = document.getElementById('bfsStart').value;
    if (!startRaw) return;

    state.bfsMarkers.forEach(layer => state.map.removeLayer(layer));
    state.bfsMarkers = [];
    document.getElementById('bfsResultArea').style.display = 'none';

    if (state.tempStartMarker) state.map.removeLayer(state.tempStartMarker);
    if (state.tempEndMarker) state.map.removeLayer(state.tempEndMarker);

    window.switchPanel('optimal');

    const formattedEnd = `(${endIata}) - ${endName}`;
    document.getElementById('startAirport').value = startRaw;
    document.getElementById('endAirport').value = formattedEnd;

    window.queryShortestRoute();
}

function renderBfsMap(data) {
    const startCoords = data.start_coords;

    const centerMarker = L.marker([startCoords[0], startCoords[1]], {
        icon: L.divIcon({
            html: `<div class="premium-marker marker-bfs-center" style="width:40px; height:40px; font-size:18px;">✈</div>`,
            className: ''
        })
    }).addTo(state.map).bindPopup(`<b>${data.start_name}</b><br>Starting Airport`);
    state.bfsMarkers.push(centerMarker);

    const allLatLngs = [[startCoords[0], startCoords[1]]];

    for (const level in data.reachable) {
        const color = BFS_COLORS[level] || '#999';

        data.reachable[level].forEach(ap => {
            const [lat, lng] = ap.coords;
            allLatLngs.push([lat, lng]);

            const marker = L.circleMarker([lat, lng], {
                radius: 5,
                fillColor: color,
                color: color,
                weight: 1,
                opacity: 0.8,
                fillOpacity: 0.6
            }).addTo(state.map).bindPopup(`<b>${ap.name}</b><br>${level} flight${level > 1 ? 's' : ''} from ${data.start}`);

            state.bfsMarkers.push(marker);
        });
    }

    if (allLatLngs.length > 1) {
        state.map.fitBounds(allLatLngs, { padding: [40, 40] });
    } else {
        state.map.flyTo([startCoords[0], startCoords[1]], 5);
    }
}

export function switchLevel(btn) {
    document.querySelectorAll('.bfsControls > div').forEach(d => d.classList.remove('selected'));
    btn.classList.add('selected');

    const levelClass = btn.classList[0]; // e.g., level-1
    document.querySelectorAll('.bfsGroup').forEach(group => {
        group.style.display = group.classList.contains(levelClass) ? 'block' : 'none';
    });
}

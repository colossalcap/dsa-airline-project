let map, markers = [], routeLine = null;
let currentRoutesData = {};
let globalAirports = [];
let tempStartMarker = null;
let tempEndMarker = null;
let bfsMarkers = [];  // For BFS reachability feature
let bfsCircles = []; // For BFS radius circles
let activePanel = 'optimal'; // Tracks the currently active tab

// ===== FADE OUT ANIMATION UTILITY =====
function fadeOutAndRemove(layer) {
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
        if (map && map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    }, 300);
}

// ===== LOADING BAR UTILITY =====
function showLoading(panelId, message) {
    const bar = document.getElementById(panelId + '-loading');
    if (bar) {
        bar.querySelector('.loading-text').textContent = message;
        bar.style.display = 'flex';
    }
}

function hideLoading(panelId) {
    const bar = document.getElementById(panelId + '-loading');
    if (bar) bar.style.display = 'none';
}

window.onload = async function () {
    initMap();
    await loadAirportOptions();
    setupInputListeners();
};

function initMap() {
    map = L.map('map').setView([20, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    map.on('click', handleMapClick);
}

function clearMap() {
    markers.forEach(fadeOutAndRemove);
    markers = [];

    if (routeLine) fadeOutAndRemove(routeLine);
    routeLine = null;

    if (tempStartMarker) fadeOutAndRemove(tempStartMarker);
    if (tempEndMarker) fadeOutAndRemove(tempEndMarker);
    tempStartMarker = null;
    tempEndMarker = null;

    bfsMarkers.forEach(fadeOutAndRemove);
    bfsMarkers = [];
    bfsCircles.forEach(fadeOutAndRemove);
    bfsCircles = [];
}

function resetRouteDisplay() {
    document.getElementById('resultCard').style.display = 'none';
    if (routeLine) {
        fadeOutAndRemove(routeLine);
        routeLine = null;
    }
    markers.forEach(fadeOutAndRemove);
    markers = [];
}

function showError(msg) {
    document.getElementById('errorMsg').innerText = msg;
    document.getElementById('errorMsg').style.display = 'block';
    document.getElementById('resultCard').style.display = 'none';
    clearMap();
}

function hideError() {
    document.getElementById('errorMsg').style.display = 'none';
}

// ===== PANEL SWITCHING & SYNCING =====
window.switchPanel = function (panelId) {
    let currentStart = "", currentEnd = "";

    if (activePanel === 'optimal') {
        currentStart = document.getElementById('startAirport').value;
        currentEnd = document.getElementById('endAirport').value;
    } else if (activePanel === 'alternatives') {
        currentStart = document.getElementById('altStart').value;
        currentEnd = document.getElementById('altEnd').value;
    } else if (activePanel === 'reachability') {
        currentStart = document.getElementById('bfsStart').value;
        currentEnd = document.getElementById('endAirport').value || document.getElementById('altEnd').value;
    }

    document.getElementById('startAirport').value = currentStart;
    document.getElementById('altStart').value = currentStart;
    document.getElementById('bfsStart').value = currentStart;
    document.getElementById('endAirport').value = currentEnd;
    document.getElementById('altEnd').value = currentEnd;

    document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    const panel = document.getElementById('panel-' + panelId);
    if (panel) panel.style.display = 'block';

    const btn = document.querySelector(`.nav-btn[data-panel="${panelId}"]`);
    if (btn) btn.classList.add('active');

    activePanel = panelId;

    clearMap();
    tempStartMarker = null;
    tempEndMarker = null;
}

// ===== CLEAR ALL INPUTS UTILITY =====
window.clearAllInputs = function () {
    document.getElementById('startAirport').value = '';
    document.getElementById('endAirport').value = '';
    document.getElementById('altStart').value = '';
    document.getElementById('altEnd').value = '';
    document.getElementById('bfsStart').value = '';

    document.querySelectorAll('.multi-city-input').forEach(input => input.value = '');

    // Baseline reset: drop any dynamically added stops past the initial 3
    const mcContainer = document.getElementById('multiCityInputsContainer');
    if (mcContainer) {
        const items = mcContainer.querySelectorAll('.input-item');
        for (let i = 3; i < items.length; i++) {
            items[i].remove();
        }
    }

    document.getElementById('resultCard').style.display = 'none';
    document.getElementById('altResultArea').style.display = 'none';
    document.getElementById('bfsResultArea').style.display = 'none';
    const mcArea = document.getElementById('multiCityResultArea');
    if (mcArea) mcArea.style.display = 'none';

    const bars = document.querySelectorAll('.loading-bar');
    bars.forEach(bar => {
        bar.style.display = 'none';
    });

    document.querySelectorAll('.bfsControls > div').forEach(d => d.classList.remove('selected'));

    hideError();
    if (typeof hideAltError === 'function') hideAltError();
    if (typeof hideBfsError === 'function') hideBfsError();
    if (typeof hideMultiCityError === 'function') hideMultiCityError();

    clearMap();
    resetRouteDisplay();
};

async function loadAirportOptions() {
    try {
        const res = await fetch('/api/airport_options');
        const data = await res.json();

        if (data.code === 1 && Array.isArray(data.options)) {
            globalAirports = data.options;
            const dataList = document.getElementById('airportList');
            dataList.innerHTML = '';

            data.options.forEach(option => {
                if (option.value && option.text) {
                    const opt = document.createElement('option');
                    opt.value = option.text;
                    dataList.appendChild(opt);
                }
            });
        }
    } catch (err) {
        console.error("Load airport options error:", err);
    }
}

function setupInputListeners() {
    document.getElementById('startAirport').addEventListener('input', (e) => handleInputChange(e, 'startAirport'));
    document.getElementById('endAirport').addEventListener('input', (e) => handleInputChange(e, 'endAirport'));
}

function handleInputChange(e, inputId) {
    resetRouteDisplay();
    hideError();

    const val = e.target.value;
    const matchedAirport = globalAirports.find(ap => ap.text === val);

    if (matchedAirport) {
        const lat = matchedAirport.lat;
        const lng = matchedAirport.lng;

        if (inputId === 'startAirport') {
            if (tempStartMarker) fadeOutAndRemove(tempStartMarker);
            tempStartMarker = L.marker([lat, lng], {
                icon: L.divIcon({ html: `<div class="premium-marker marker-start"><i class="fa fa-plane"></i></div>`, className: '' })
            }).addTo(map).bindTooltip("Departure Set", { permanent: true, direction: "top" }).openTooltip();
        } else {
            if (tempEndMarker) fadeOutAndRemove(tempEndMarker);
            tempEndMarker = L.marker([lat, lng], {
                icon: L.divIcon({ html: `<div class="premium-marker marker-end"><i class="fa fa-plane"></i></div>`, className: '' })
            }).addTo(map).bindTooltip("Arrival Set", { permanent: true, direction: "top" }).openTooltip();
        }
        map.flyTo([lat, lng], 5, { duration: 1.5 });
    } else {
        if (inputId === 'startAirport' && tempStartMarker) {
            fadeOutAndRemove(tempStartMarker);
            tempStartMarker = null;
        } else if (inputId === 'endAirport' && tempEndMarker) {
            fadeOutAndRemove(tempEndMarker);
            tempEndMarker = null;
        }
    }
}

// --- SMART RADAR MAP CLICK LOGIC ---
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function handleMapClick(e) {
    const clickLat = e.latlng.lat;
    const clickLng = e.latlng.lng;

    const nearbyAirports = globalAirports.filter(airport => {
        const dist = getDistanceFromLatLonInKm(clickLat, clickLng, airport.lat, airport.lng);
        return dist <= 150;
    });

    if (nearbyAirports.length === 0) {
        L.popup()
            .setLatLng(e.latlng)
            .setContent("<div class='custom-map-popup'><b>No airports found within 150km.</b><br>Try clicking closer to a city!</div>")
            .openOn(map);
        return;
    }

    let optionsHtml = nearbyAirports.map(ap => `<option value="${ap.text}" data-lat="${ap.lat}" data-lng="${ap.lng}">${ap.text}</option>`).join('');

    let popupContent = `
        <div style="text-align:center; min-width: 200px; color:#333;">
            <b style="color:#001A4D;">${nearbyAirports.length} Airport(s) Nearby</b><br>
            <select id="mapPopupSelect" style="width:100%; margin: 10px 0; padding: 5px; border-radius:3px; color:#333;">
                ${optionsHtml}
            </select>
            <div style="display:flex; gap:10px; justify-content:center;">
    `;

    if (activePanel === 'multicity') {
        popupContent += `
                <button onclick="setMapSelection('multiCity')" style="background:#10b981; color:white; font-weight:bold; border:none; padding:8px; border-radius:4px; cursor:pointer; flex:1;">Add Stop</button>
        `;
    } else {
        popupContent += `
                <button onclick="setMapSelection('startAirport')" style="background:#001A4D; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer; flex:1;">Set From</button>
                <button onclick="setMapSelection('endAirport')" style="background:#FFB81C; color:#001A4D; font-weight:bold; border:none; padding:8px; border-radius:4px; cursor:pointer; flex:1;">Set To</button>
        `;
    }

    popupContent += `
            </div>
        </div>
    `;

    L.popup()
        .setLatLng(e.latlng)
        .setContent(popupContent)
        .openOn(map);
}

window.setMapSelection = function (inputId) {
    resetRouteDisplay();
    hideError();

    const selectEl = document.getElementById('mapPopupSelect');
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const selectedText = selectedOption.value;
    const lat = parseFloat(selectedOption.getAttribute('data-lat'));
    const lng = parseFloat(selectedOption.getAttribute('data-lng'));

    if (inputId === 'multiCity') {
        const inputs = document.querySelectorAll('.multi-city-input');
        let filled = false;
        for (let i = 0; i < inputs.length; i++) {
            if (!inputs[i].value.trim()) {
                inputs[i].value = selectedText;
                filled = true;
                break;
            }
        }
        
        // Dynamic auto-expansion if all boxes are currently filled!
        if (!filled) {
            if (inputs.length >= 8) {
                alert("Maximum 8 stops allowed.");
            } else {
                window.addMultiCityStop();
                const newInputs = document.querySelectorAll('.multi-city-input');
                newInputs[newInputs.length - 1].value = selectedText;
            }
        }
        map.closePopup();
        return;
    }

    if (activePanel === 'optimal') {
        document.getElementById(inputId).value = selectedText;
    } else if (activePanel === 'alternatives') {
        document.getElementById(inputId === 'startAirport' ? 'altStart' : 'altEnd').value = selectedText;
    } else if (activePanel === 'reachability' && inputId === 'startAirport') {
        document.getElementById('bfsStart').value = selectedText;
    }

    map.closePopup();

    if (inputId === 'startAirport') {
        if (tempStartMarker) fadeOutAndRemove(tempStartMarker);
        tempStartMarker = L.marker([lat, lng], {
            icon: L.divIcon({ html: `<div class="premium-marker marker-start"><i class="fa fa-plane"></i></div>`, className: '' })
        }).addTo(map).bindTooltip("Departure Set", { permanent: true, direction: "top" }).openTooltip();
    } else {
        if (tempEndMarker) fadeOutAndRemove(tempEndMarker);
        tempEndMarker = L.marker([lat, lng], {
            icon: L.divIcon({ html: `<div class="premium-marker marker-end"><i class="fa fa-plane"></i></div>`, className: '' })
        }).addTo(map).bindTooltip("Arrival Set", { permanent: true, direction: "top" }).openTooltip();
    }

    map.flyTo([lat, lng], 5, { duration: 1.5 });
}

function extractIATA(str) {
    const match = str.match(/\(([A-Z]{3})\)/);
    return match ? match[1] : str.substring(0, 3).toUpperCase();
}

function extractAirportName(str) {
    const parts = str.split(") - ");
    return parts[1] || str;
}

// ===================================================================
// PANEL 1: OPTIMAL ROUTE QUERY
// ===================================================================
async function queryShortestRoute() {
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

        currentRoutesData = data.routes;
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
        const route = currentRoutesData[crit];
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
    allRoutesContainer.innerHTML = '';
    const pathKeys = Object.keys(uniquePaths);

    if (pathKeys.length === 1) {
        if (bestBadge) bestBadge.style.display = 'block';
        const singlePath = uniquePaths[pathKeys[0]];
        createRouteCard(singlePath, 'Best Route', allRoutesContainer, criteriaNames);
    } else {
        if (bestBadge) bestBadge.style.display = 'none';
        pathKeys.forEach((pathKey, index) => {
            const pathData = uniquePaths[pathKey];
            const cardTitle = `Route ${index + 1}`;
            createRouteCard(pathData, cardTitle, allRoutesContainer, criteriaNames);
        });
    }

    if (pathKeys.length > 0) {
        const firstRouteData = uniquePaths[pathKeys[0]].routeData;
        if (routeLine) fadeOutAndRemove(routeLine);
        markers.forEach(fadeOutAndRemove);
        markers = [];
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
            
            <div class="showRoute">Show on Map</div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', cardHTML);

    const cardElement = container.lastElementChild;
    const showMapBtn = cardElement.querySelector('.showRoute');

    showMapBtn.addEventListener('click', () => {
        if (routeLine) fadeOutAndRemove(routeLine);
        markers.forEach(fadeOutAndRemove);
        markers = [];
        renderMap(routeData);

        document.querySelectorAll('.result-card').forEach(card => {
            card.classList.remove('selected');
        });
        cardElement.classList.add('selected');
    });
}

function renderMap(data) {
    const { path, path_names, coords } = data;
    const latlngs = [];

    let stopNumber = 1;

    path.forEach((iata, index) => {
        const fullName = path_names[index];
        const [lat, lng] = coords[iata];
        latlngs.push([lat, lng]);

        const isRequested = data.requested_stops && data.requested_stops.includes(iata);

        let markerHtml = '';
        let popupText = '';

        if (isRequested || index === 0 || index === path.length - 1) {
            // Numbered Requested Stops
            let bg = '#3b82f6'; // Blue for middle stops
            if (index === 0) bg = '#22c55e'; // Green for start
            else if (index === path.length - 1) bg = '#ef4444'; // Red for end
            
            markerHtml = `<div class="premium-marker" style="background: ${bg}; color: white; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); width: 34px; height: 34px; display:flex; align-items:center; justify-content:center; border-radius:50%; font-weight:bold; font-size:16px; margin-top:-17px; margin-left:-17px;">${stopNumber}</div>`;
            popupText = `<b>${fullName}</b><br>Itinerary Stop ${stopNumber}`;
            stopNumber++;
        } else {
            // Minimalist Layover Dots
            markerHtml = `<div style="background: white; border: 3px solid #f97316; width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); margin-top:-7px; margin-left:-7px;"></div>`;
            popupText = `<b>${fullName}</b><br>Layover`;
        }

        const marker = L.marker([lat, lng], {
            icon: L.divIcon({ html: markerHtml, className: '' })
        }).addTo(map).bindPopup(popupText);

        markers.push(marker);
    });

    if (typeof L.polyline.antPath === 'function') {
        routeLine = L.polyline.antPath(latlngs, {
            "delay": 400,
            "dashArray": [15, 30],
            "weight": 5,
            "color": "#00E5FF",
            "pulseColor": "#001A4D",
            "paused": false,
            "reverse": false,
            "hardwareAccelerated": true
        }).addTo(map);
    } else {
        routeLine = L.polyline(latlngs, { color: '#00E5FF', weight: 4 }).addTo(map);
    }

    routeLine.bindPopup(`<b>Route</b><br>Distance: ${data.total_distance}km<br>Price: $${data.total_price}`);
    map.fitBounds(latlngs, { padding: [50, 50] });
}


// ===================================================================
// PANEL 2: ALTERNATIVE ROUTES
// ===================================================================
let altRoutesData = [];

function showAltError(msg) {
    const el = document.getElementById('altErrorMsg');
    if (el) {
        el.innerText = msg;
        el.style.display = 'block';
    }
    const area = document.getElementById('altResultArea');
    if (area) area.style.display = 'none';
}

function hideAltError() {
    const el = document.getElementById('altErrorMsg');
    if (el) el.style.display = 'none';
}

async function queryAlternativeRoutes() {
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

        altRoutesData = data.routes;
        document.getElementById('altResultArea').style.display = 'block';
        document.getElementById('altSummary').innerHTML =
            `🔍 Found <strong>${data.count}</strong> alternative route${data.count > 1 ? 's' : ''} (max ${maxConn} flights)`;

        renderAltRoutesList();

        if (altRoutesData.length > 0) {
            selectAltRoute(0);
        }

    } catch (err) {
        hideLoading('alt');
        showAltError(`Script Error: ${err.message}`);
        console.error(err);
    }
}

window.sortAltRoutes = function (value, element) {
    const buttons = document.querySelectorAll('.alt-sort-controls .tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    element.classList.add('active');

    if (value === 'cheapest') {
        altRoutesData.sort((a, b) => a.total_price - b.total_price);
    } else if (value === 'fastest') {
        altRoutesData.sort((a, b) => a.total_time - b.total_time);
    } else if (value === 'shortest') {
        altRoutesData.sort((a, b) => a.total_distance - b.total_distance);
    }

    renderAltRoutesList();

    if (altRoutesData.length > 0) {
        selectAltRoute(0);
    }
};

function renderAltRoutesList() {
    const container = document.getElementById('altRoutesList');
    container.innerHTML = '';

    const minPrice = Math.min(...altRoutesData.map(r => r.total_price));
    const minTime = Math.min(...altRoutesData.map(r => r.total_time));
    const minDistance = Math.min(...altRoutesData.map(r => r.total_distance));

    altRoutesData.forEach((route, idx) => {
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

        card.innerHTML = `
            <div class="first"><div class="title">Route ${idx + 1}</div><div class="type">${typeHTML}</div></div>
            <div class="second"><div class="path">${route.path.join(' → ')}</div><div class="stops">${flights <= 0 ? 'Direct' : `${flights} stop${flights > 1 ? 's' : ''}`}</div><div class="time">${hours}h ${mins}m</div></div>
            <div class="third"><div class="price">$${route.total_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <div class="distance">${route.total_distance.toLocaleString()} km</div></div>
            <div class="showRoute" onclick="selectAltRoute(${idx})">Show on Map</div>
        `;
        container.appendChild(card);
    });
    selectAltRoute(0);
}

function selectAltRoute(index) {
    document.querySelectorAll('.alt-route-card').forEach(c => c.classList.remove('selected'));
    const selectedCard = document.querySelector(`.alt-route-card[data-index="${index}"]`);
    if (selectedCard) selectedCard.classList.add('selected');

    const route = altRoutesData[index];
    if (!route) return;

    if (routeLine) fadeOutAndRemove(routeLine);
    markers.forEach(fadeOutAndRemove);
    markers = [];

    const mapData = {
        path: route.path,
        path_names: route.path_names,
        coords: route.coords,
        total_distance: route.total_distance,
        total_price: route.total_price
    };

    renderMap(mapData);
}

window.queryAlternativeRoutes = queryAlternativeRoutes;


// ===================================================================
// PANEL 3: REACHABILITY MAP
// ===================================================================
function showBfsError(msg) {
    const el = document.getElementById('bfsErrorMsg');
    if (el) {
        el.innerText = msg;
        el.style.display = 'block';
    }
    const area = document.getElementById('bfsResultArea');
    if (area) area.style.display = 'none';
}

function hideBfsError() {
    const el = document.getElementById('bfsErrorMsg');
    if (el) el.style.display = 'none';
}

const BFS_COLORS = {
    1: 'rgb(27, 103, 246)',
    2: 'rgb(34, 197, 94)',
    3: 'rgb(168, 85, 247)',
    4: 'rgb(255, 107, 0)'
};

async function queryReachability() {
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

function renderBfsLevels(reachable) {
    const container = document.getElementById('bfsLevelList');
    const airport = extractAirportName(document.getElementById('bfsStart').value);
    container.innerHTML = '';

    const levelLabels = {
        1: 'Direct',
        2: '1 Stop',
        3: '2 Stops',
        4: '3 Stops'
    };

    for (const level of Object.keys(reachable).sort()) {
        const controlBtn = document.querySelector(`.bfsControls .level-${level}`);
        if (controlBtn) controlBtn.style.display = "block";

        const airports = reachable[level];
        const group = document.createElement('div');
        group.classList.add('bfsGroup', `level-${level}`);

        const header = document.createElement('div');
        const span = document.createElement('span');
        header.className = `title`;
        header.innerHTML = `${levelLabels[level] + ' flights'} from <span>${airport}</span>`;
        group.appendChild(header);

        const list = document.createElement('div');
        list.className = 'bfs-airport-list';

        airports.forEach(ap => {
            const chip = document.createElement('span');
            chip.className = 'bfs-airport-chip';
            chip.textContent = ap.iata;
            chip.title = ap.name;
            chip.onclick = () => {
                const coords = ap.coords;
                if (coords) {
                    map.flyTo([coords[0], coords[1]], 6, { duration: 1.0 });
                }
            };
            list.appendChild(chip);
        });

        group.appendChild(list);

        const footer = document.createElement('div');
        footer.className = `total`;
        footer.textContent = `Total: ${airports.length} ${level > 1 ? '' : 'direct '}airport${airports.length > 1 ? 's' : ''} ${level > 1 ? 'with ' + levelLabels[level] : ''}`;
        group.appendChild(footer);

        container.appendChild(group);
    }
}

function renderBfsMap(data) {
    const startCoords = data.start_coords;

    const centerMarker = L.marker([startCoords[0], startCoords[1]], {
        icon: L.divIcon({
            html: `<div class="premium-marker marker-bfs-center" style="width:40px; height:40px; font-size:18px;">✈</div>`,
            className: ''
        })
    }).addTo(map).bindPopup(`<b>${data.start_name}</b><br>Starting Airport`);
    bfsMarkers.push(centerMarker);

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
            }).addTo(map).bindPopup(`<b>${ap.name}</b><br>${level} flight${level > 1 ? 's' : ''} from ${data.start}`);

            bfsMarkers.push(marker);
        });
    }

    if (allLatLngs.length > 1) {
        map.fitBounds(allLatLngs, { padding: [40, 40] });
    } else {
        map.flyTo([startCoords[0], startCoords[1]], 5);
    }
}

function switchLevel(btn) {
    document.querySelectorAll('.bfsControls > div').forEach(d => d.classList.remove('selected'));
    btn.classList.add('selected');

    const level = btn.classList[0];
    document.querySelectorAll('.bfsGroup').forEach(group => {
        group.style.display = group.classList.contains(level) ? 'block' : 'none';
    });
}

window.queryReachability = queryReachability;

// ===================================================================
// PANEL 4: MULTI-CITY PLANNER
// ===================================================================
function showMultiCityError(msg) {
    const el = document.getElementById('multiCityErrorMsg');
    if (el) {
        el.innerText = msg;
        el.style.display = 'block';
    } else {
        alert(msg);
    }
}

function hideMultiCityError() {
    const el = document.getElementById('multiCityErrorMsg');
    if (el) el.style.display = 'none';
}

window.addMultiCityStop = function() {
    const container = document.getElementById('multiCityInputsContainer');
    const stopCount = container.querySelectorAll('.input-item').length + 1;
    
    if (stopCount > 8) {
        showMultiCityError("Maximum 8 stops allowed.");
        return;
    }
    
    const div = document.createElement('div');
    div.className = 'input-item';
    div.style.width = '100%';
    div.innerHTML = `
        <label>Stop ${stopCount} (Optional)</label>
        <div class="list">
            <i class="fa fa-map-marker"></i>
            <input type="text" class="multi-city-input" list="airportList" autocomplete="off" placeholder="City or Airport">
            <i class="fa fa-chevron-down"></i>
        </div>
    `;
    container.appendChild(div);
};

async function queryMultiCity() {
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

        if (data.code === 0) {
            showMultiCityError(data.msg);
            return;
        }

        renderMap(data.route);

        const area = document.getElementById('multiCityResultArea');
        if (area) {
            const { path, total_time, total_distance, total_price } = data.route;
            const hour = Math.floor(total_time / 60);
            const min = total_time % 60;
            
            area.innerHTML = `
                <div class="summary" style="background: linear-gradient(135deg, #ffffff, #f0f7ff); border-left: 5px solid #1B67F6; padding: 15px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div style="font-size: 16px; font-weight: 800; color: #1e293b; margin-bottom: 10px;"><i class="fa fa-ticket"></i> Multi-City Itinerary</div>
                    <div style="margin-bottom: 8px; font-size: 14px;"><b>Path:</b><br/> ${path.join(' <i class="fa fa-arrow-right" style="color: #94a3b8; font-size: 12px; margin: 0 4px;"></i> ')}</div>
                    <div style="margin-bottom: 5px; font-size: 14px;"><b>Total Price:</b> <span style="color: #059669; font-weight: 800; font-size: 16px;">$${total_price.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits:2})}</span></div>
                    <div style="margin-bottom: 5px; font-size: 14px;"><b>Flight Distance:</b> ${total_distance.toLocaleString()} km</div>
                    <div style="font-size: 14px;"><b>Total Airtime:</b> ${hour}h ${min}m</div>
                </div>
            `;
            area.style.display = 'block';
        }

    } catch (err) {
        hideLoading('multicity');
        showMultiCityError(`Script Error: ${err.message}`);
        console.error(err);
    }
}

window.queryMultiCity = queryMultiCity;
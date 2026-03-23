let map, markers = [], routeLine = null;
let currentRoutesData = {};
let globalAirports = [];
let tempStartMarker = null;
let tempEndMarker = null;
let bfsMarkers = [];  // For BFS reachability feature
let bfsCircles = []; // For BFS radius circles
let activePanel = 'optimal'; // Tracks the currently active tab

// ===== FADE OUT ANIMATION UTILITY (FIXED & BULLETPROOF) =====
function fadeOutAndRemove(layer) {
    if (!layer) return;

    try {
        // Safe access for vector layers (lines, circles)
        if (typeof layer.getElement === 'function') {
            const el = layer.getElement();
            if (el && el.classList) el.classList.add('fade-out-layer');
        }

        // Safe access for standard HTML markers
        if (layer._icon && layer._icon.classList) layer._icon.classList.add('fade-out-layer');
        if (layer._shadow && layer._shadow.classList) layer._shadow.classList.add('fade-out-layer');

        // Safe access for grouped layers like AntPath
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

    // Wait 300ms for CSS to finish fading, then permanently remove it
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
    document.querySelectorAll('.collapseBtn').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.floating').forEach(p => p.classList.remove('active'));

    const panel = document.getElementById('panel-' + panelId);
    if (panel) panel.style.display = 'block';

    const btn = document.querySelector(`.nav-btn[data-panel="${panelId}"]`);
    if (btn) btn.classList.add('active');

    const collpaseBtn = document.querySelector('div[value="panel-' + panelId + '"]');
    if (collpaseBtn) collpaseBtn.style.display = 'block';

    const floating = document.querySelector('div[value="panel-' + panelId + '"].expand');
    if (floating) document.querySelector('div[value="panel-' + panelId + '"].floating').classList.add("active");

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

    document.getElementById('resultCard').style.display = 'none';
    document.getElementById('altResultArea').style.display = 'none';
    document.getElementById('bfsResultArea').style.display = 'none';

    const bars = document.querySelectorAll('.loading-bar');
    bars.forEach(bar => {
        bar.style.display = 'none';
    });

    document.querySelectorAll('.bfsControls > div').forEach(d => d.classList.remove('selected'));
    document.querySelectorAll(".floating .box").forEach(b => b.innerHTML = "");

    hideError();
    if (typeof hideAltError === 'function') hideAltError();
    if (typeof hideBfsError === 'function') hideBfsError();

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
                <button onclick="setMapSelection('startAirport')" style="background:#001A4D; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer; flex:1;">Set From</button>
                <button onclick="setMapSelection('endAirport')" style="background:#FFB81C; color:#001A4D; font-weight:bold; border:none; padding:8px; border-radius:4px; cursor:pointer; flex:1;">Set To</button>
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
    return parts[1];
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
        // Show the actual error message now instead of generic text
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
    const floatContainer = document.querySelector('div[value="panel-optimal"].floating .box');
    allRoutesContainer.innerHTML = '';
    const pathKeys = Object.keys(uniquePaths);

    if (pathKeys.length === 1) {
        bestBadge.style.display = 'block';
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

    path.forEach((iata, index) => {
        const fullName = path_names[index];
        const [lat, lng] = coords[iata];
        latlngs.push([lat, lng]);

        let markerHtml = '';
        let popupText = '';

        if (index === 0) {
            markerHtml = `<div class="premium-marker marker-start"><i class="fa fa-plane"></i></div>`;
            popupText = `<b>${fullName}</b><br>Departure Airport`;
        } else if (index === path.length - 1) {
            markerHtml = `<div class="premium-marker marker-end"><i class="fa fa-plane"></i></div>`;
            popupText = `<b>${fullName}</b><br>Arrival Airport`;
        } else {
            markerHtml = `<div class="marker-layover"><i class="fa fa-map-marker"></i></div>`;
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

    routeLine.bindPopup(`<b>Optimal Route</b><br>Distance: ${data.total_distance}km<br>Price: $${data.total_price}`);
    map.fitBounds(latlngs, { padding: [50, 50] });
}


// ===================================================================
// PANEL 2: ALTERNATIVE ROUTES
// ===================================================================
let altRoutesData = [];

function showAltError(msg) {
    const el = document.getElementById('altErrorMsg');
    el.innerText = msg;
    el.style.display = 'block';
    document.getElementById('altResultArea').style.display = 'none';
}

function hideAltError() {
    document.getElementById('altErrorMsg').style.display = 'none';
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

    showLoading('alt', `Running DFS with Backtracking: ${start} → ${end} (max ${maxConn} flights) ...`);
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

        document.querySelector(".tab-btn.cheapest").click();
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
    } else if (value === 'fewest') {
        altRoutesData.sort((a, b) => a.path.length - b.path.length);
    }
    renderAltRoutesList();
};

function renderAltRoutesList() {
    const container = document.getElementById('altRoutesList');
    container.innerHTML = '';

    const floatContainer = document.querySelector('div[value="panel-alternatives"] .box');
    floatContainer.innerHTML = '';

    const minPrice = Math.min(...altRoutesData.map(r => r.total_price));
    const minTime = Math.min(...altRoutesData.map(r => r.total_time));
    const minDistance = Math.min(...altRoutesData.map(r => r.total_distance));
    const minStops = Math.min(...altRoutesData.map(r => r.path.length));

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
        if (route.path.length === minStops) {
            card.classList.add("fewest");
            typeHTML += `<div class="fewest"></div>`
        }

        card.innerHTML = `
            <div class="first"><div class="title">Route ${idx + 1}</div><div class="type">${typeHTML}</div></div>
            <div class="second"><div class="path">${route.path.join(' → ')}</div><div class="stops">${flights <= 0 ? 'Direct' : `${flights} stop${flights > 1 ? 's' : ''}`}</div><div class="time">${hours}h ${mins}m</div></div>
            <div class="third"><div class="price">$${route.total_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <div class="distance">${route.total_distance.toLocaleString()} km</div></div>
            <div class="showRoute" onclick="selectAltRoute(${idx})">Show on Map</div>
        `;
        
        container.appendChild(card);
        selectAltRoute(0);
        const cardClone = card.cloneNode(true);
        floatContainer.appendChild(cardClone);        
    });
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
    el.innerText = msg;
    el.style.display = 'block';
    document.getElementById('bfsResultArea').style.display = 'none';
}

function hideBfsError() {
    document.getElementById('bfsErrorMsg').style.display = 'none';
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

    const floatContainer = document.querySelector("div[value=panel-reachability].floating .box");
    floatContainer.innerHTML = '';

    const levelLabels = {
        1: 'Direct',
        2: '1 Stop',
        3: '2 Stops',
        4: '3 Stops'
    };

    document.querySelectorAll('.bfsControls div').forEach(p => p.style.display = "none");
    for (const level of Object.keys(reachable).sort()) {
        // Make button appear
        document.querySelector(`.bfsControls .level-${level}`).style.display = "block";

        const airports = reachable[level];
        const group = document.createElement('div');
        group.classList.add('bfsGroup', `level-${level}`);

        const floatGroup = document.createElement('div');
        floatGroup.classList.add('result-card', `level-${level}`);

        const header = document.createElement('div');
        const span = document.createElement('span');
        header.className = `title`;
        header.innerHTML = `${levelLabels[level] + ' flights'} from <span>${airport}</span>`;
        group.appendChild(header);

        const headerClone = header.cloneNode(true);
        floatGroup.appendChild(headerClone);

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

        const floatList = document.createElement('div');
        floatList.className = 'bfs-airport-list';

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
        floatContainer.appendChild(floatGroup);


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


// ===================================================================
// FLOATING PANEL
// ===================================================================
function collapsePanel(element) {
    const panelID = element.getAttribute("value");
    let panel = document.getElementById(panelID);

    if (element.classList.contains("collapse")) {
        panel.classList.add("collapse");
        element.classList.remove("collapse");
        element.classList.add("expand");
        element.querySelector("span").textContent = "Expand";
        
        if (document.querySelector('div[value="' + panelID + '"].floating .box div') != null) {
            document.querySelector('div[value="' + panelID + '"].floating').classList.add("active");

            document.querySelectorAll('div[value="' + panelID + '"].floating .result-card').forEach(div => div.classList.remove('active'));
            const index = Array.from(document.querySelectorAll('div[id="' + panelID + '"] .result-card'))
                .findIndex(div => div.classList.contains('selected'));
            
            if (panelID != "panel-reachability") { 
                document.querySelectorAll('div[value="' + panelID + '"].floating .result-card')[index].classList.add("active");
            } else {
                const index = Array.from(document.querySelectorAll('div[id="' + panelID + '"] .bfsControls div'))
                .findIndex(div => div.classList.contains('selected'));
                document.querySelectorAll('div[value="' + panelID + '"].floating .result-card')[index].classList.add("active");
            }
        }
    }
    else {
        panel.classList.remove("collapse");
        element.classList.add("collapse");
        element.classList.remove("expand");
        element.querySelector("span").textContent = "Collapse";
        document.querySelector('div[value="' + panelID + '"].floating').classList.remove("active");

        document.querySelectorAll('div[id="' + panelID + '"] .result-card').forEach(div => div.classList.remove('selected'));
        const index = Array.from(document.querySelectorAll('div[value="' + panelID + '"].floating .result-card'))
            .findIndex(div => div.classList.contains('active'));

        if (panelID != "panel-reachability") { 
            document.querySelectorAll('div[id="' + panelID + '"] .result-card')[index].querySelector(".showRoute").click();
        } else {
            const index = Array.from(document.querySelectorAll('div[value="' + panelID + '"].floating .result-card'))
            .findIndex(div => div.classList.contains('active'));
            document.querySelectorAll('div[id="' + panelID + '"] .bfsControls div')[index].click();
        }
    }
}

function floatCardControl(element, direction) {
    const cards = Array.from(element.parentElement.querySelectorAll(".result-card"));
    const activeIndex = cards.findIndex(c => c.classList.contains('active'));;

    let newIndex = activeIndex + direction;
    if (newIndex >= cards.length) newIndex = 0;
    if (newIndex < 0) newIndex = cards.length - 1;

    cards[activeIndex].classList.remove('active');
    cards[newIndex].classList.add('active');

    const showRoute = cards[newIndex].querySelector(".showRoute");
    if (showRoute) showRoute.click();
}

window.queryReachability = queryReachability;
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

window.onload = async function() {
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
window.switchPanel = function(panelId) {
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

    document.querySelectorAll('.panel-card').forEach(p => p.style.display = 'none');
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
window.clearAllInputs = function() {
    document.getElementById('startAirport').value = '';
    document.getElementById('endAirport').value = '';
    document.getElementById('altStart').value = '';
    document.getElementById('altEnd').value = '';
    document.getElementById('bfsStart').value = '';
    
    document.getElementById('resultCard').style.display = 'none';
    document.getElementById('altResultArea').style.display = 'none';
    document.getElementById('bfsResultArea').style.display = 'none';
    
    hideError();
    if(typeof hideAltError === 'function') hideAltError();
    if(typeof hideBfsError === 'function') hideBfsError();
    
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
                icon: L.divIcon({ html: `<div class="premium-marker marker-start" style="width:30px; height:30px;">🛫</div>`, className: '' })
            }).addTo(map).bindTooltip("Departure Set", {permanent: true, direction: "top"}).openTooltip();
        } else {
            if (tempEndMarker) fadeOutAndRemove(tempEndMarker);
            tempEndMarker = L.marker([lat, lng], {
                icon: L.divIcon({ html: `<div class="premium-marker marker-end" style="width:30px; height:30px;">🛬</div>`, className: '' })
            }).addTo(map).bindTooltip("Arrival Set", {permanent: true, direction: "top"}).openTooltip();
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
    const dLat = (lat2 - lat1) * (Math.PI/180);
    const dLon = (lon2 - lon1) * (Math.PI/180); 
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
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
            .setContent("<div style='text-align:center; color:#333;'><b>No airports found within 150km.</b><br>Try clicking closer to a city!</div>")
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

window.setMapSelection = function(inputId) {
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
            icon: L.divIcon({ html: `<div class="premium-marker marker-start" style="width:30px; height:30px;">🛫</div>`, className: '' })
        }).addTo(map).bindTooltip("Departure Set", {permanent: true, direction: "top"}).openTooltip();
    } else {
        if (tempEndMarker) fadeOutAndRemove(tempEndMarker);
        tempEndMarker = L.marker([lat, lng], {
            icon: L.divIcon({ html: `<div class="premium-marker marker-end" style="width:30px; height:30px;">🛬</div>`, className: '' })
        }).addTo(map).bindTooltip("Arrival Set", {permanent: true, direction: "top"}).openTooltip();
    }

    map.flyTo([lat, lng], 5, { duration: 1.5 });
}

function extractIATA(str) {
    const match = str.match(/\(([A-Z]{3})\)/);
    return match ? match[1] : str.substring(0, 3).toUpperCase();
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

        const firstTabCrit = document.querySelector('.tab-btn').dataset.target;
        switchTab(firstTabCrit);
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
        'time': 'Fastest',
        'price': 'Cheapest',
        'distance': 'Shortest Distance',
        'connections': 'Fewest Stops'
    };

    for (const crit of ['time', 'price', 'distance', 'connections']) {
        const route = currentRoutesData[crit];
        if (!route) continue;
        const pathStr = route.path.join(',');
        
        if (!uniquePaths[pathStr]) {
            uniquePaths[pathStr] = { criterias: [crit], routeData: route };
        } else {
            uniquePaths[pathStr].criterias.push(crit);
        }
    }

    const tabsContainer = document.getElementById('routeTabs');
    tabsContainer.innerHTML = '';
    const pathKeys = Object.keys(uniquePaths);

    if (pathKeys.length === 1) {
        document.getElementById('bestOverallBadge').style.display = 'block';
        tabsContainer.style.display = 'none';
        const singleCrit = uniquePaths[pathKeys[0]].criterias[0];
        currentRoutesData[singleCrit].groupedTitle = 'Best Overall Itinerary';
        const btn = document.createElement('button');
        btn.className = 'tab-btn';
        btn.dataset.target = singleCrit;
        tabsContainer.appendChild(btn);
    } else {
        document.getElementById('bestOverallBadge').style.display = 'none';
        tabsContainer.style.display = 'flex';
        for (const pathStr in uniquePaths) {
            const group = uniquePaths[pathStr];
            const tabLabels = group.criterias.map(c => criteriaNames[c]).join(' & ');
            const primaryCrit = group.criterias[0];
            const btn = document.createElement('button');
            btn.className = 'tab-btn';
            btn.onclick = () => switchTab(primaryCrit);
            btn.innerText = tabLabels;
            btn.dataset.target = primaryCrit;
            tabsContainer.appendChild(btn);
            group.criterias.forEach(c => {
                currentRoutesData[c].groupedTitle = tabLabels + ' Itinerary';
            });
        }
    }
}

window.switchTab = function(criteria) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.tab-btn[data-target="${criteria}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const routeData = currentRoutesData[criteria];
    if (!routeData) return;

    document.getElementById('routeTitle').innerText = routeData.groupedTitle;
    document.getElementById('routePath').innerText = routeData.path.join(' → ');
    document.getElementById('totalHours').innerText = Math.floor(routeData.total_time / 60);
    document.getElementById('totalMins').innerText = routeData.total_time % 60;
    document.getElementById('totalDistance').innerText = routeData.total_distance.toLocaleString() + ' km';
    document.getElementById('totalPrice').innerText = '$' + routeData.total_price.toLocaleString(undefined, {minimumFractionDigits: 2});

    if (routeLine) fadeOutAndRemove(routeLine);
    markers.forEach(fadeOutAndRemove);
    markers = [];
    
    renderMap(routeData);
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
            markerHtml = `<div class="premium-marker marker-start" style="width:35px; height:35px;">🛫</div>`;
            popupText = `<b>${fullName}</b><br>Departure Airport`;
        } else if (index === path.length - 1) {
            markerHtml = `<div class="premium-marker marker-end" style="width:35px; height:35px;">🛬</div>`;
            popupText = `<b>${fullName}</b><br>Arrival Airport`;
        } else {
            markerHtml = `<div class="premium-marker marker-layover" style="width:25px; height:25px;">🔵</div>`;
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

        document.getElementById('altSortSelect').value = 'cheapest';
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

window.sortAltRoutes = function() {
    const sortCriteria = document.getElementById('altSortSelect').value;
    
    if (sortCriteria === 'cheapest') {
        altRoutesData.sort((a, b) => a.total_price - b.total_price);
    } else if (sortCriteria === 'fastest') {
        altRoutesData.sort((a, b) => a.total_time - b.total_time);
    } else if (sortCriteria === 'transits') {
        altRoutesData.sort((a, b) => a.path.length - b.path.length);
    }
    
    renderAltRoutesList();
    
    if (altRoutesData.length > 0) {
        selectAltRoute(0);
    }
};

function renderAltRoutesList() {
    const container = document.getElementById('altRoutesList');
    container.innerHTML = '';

    altRoutesData.forEach((route, idx) => {
        const card = document.createElement('div');
        card.className = 'alt-route-card';
        card.dataset.index = idx;
        card.onclick = () => selectAltRoute(idx);

        const flights = route.path.length - 1;
        const hours = Math.floor(route.total_time / 60);
        const mins = route.total_time % 60;

        card.innerHTML = `
            <div class="route-number">Route ${idx + 1} · ${flights} flight${flights > 1 ? 's' : ''}</div>
            <div class="route-path">${route.path.join(' → ')}</div>
            <div class="route-stats">
                <span>⏱ ${hours}h ${mins}m</span>
                <span>📏 ${route.total_distance.toLocaleString()} km</span>
                <span>💰 $${route.total_price.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>
        `;
        container.appendChild(card);
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
    1: '#43a047',
    2: '#1e88e5',
    3: '#8e24aa',
    4: '#e65100'
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
    container.innerHTML = '';

    const levelLabels = {
        1: '1 Flight (Direct)',
        2: '2 Flights (1 Stop)',
        3: '3 Flights (2 Stops)',
        4: '4 Flights (3 Stops)'
    };

    for (const level of Object.keys(reachable).sort()) {
        const airports = reachable[level];
        const group = document.createElement('div');
        group.className = 'bfs-level-group';

        const header = document.createElement('div');
        header.className = `bfs-level-header level-${level}`;
        header.textContent = `${levelLabels[level] || level + ' flights'} — ${airports.length} airport${airports.length > 1 ? 's' : ''}`;
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

window.queryReachability = queryReachability;
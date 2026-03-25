let map, markers = [], routeLine = null;
let currentRoutesData = {};
let globalAirports = [];
let tempStartMarker = null;
let tempEndMarker = null;
let bfsMarkers = [];  // For BFS reachability feature
let bfsCircles = []; // For BFS radius circles
let activePanel = 'optimal'; // Tracks the currently active tab
let originalPanelForDetails = 'optimal'; // Tracks where we came from
let currentMultiCityRoute = null; // Stores the multi-city data for the details panel

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

window.recenterMap = function () {
    if (map) {
        // Flies back to the exact coordinates and zoom level from your initMap function
        map.flyTo([20, 0], 3, { duration: 1.5 });
    }
};

window.onload = async function () {
    initMap();
    await loadAirportOptions();
    setupInputListeners();
    setupDarkMode();

    // Initialize UI state
    switchPanel('optimal');
};

// ===== DARK MODE SETUP =====
function setupDarkMode() {
    const toggleBtn = document.getElementById('darkModeToggle');
    if (!toggleBtn) return;

    const icon = toggleBtn.querySelector('i');

    // Check local storage for existing preference
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-mode');
        icon.classList.replace('fa-moon-o', 'fa-sun-o');
    }

    toggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        if (document.body.classList.contains('dark-mode')) {
            localStorage.setItem('theme', 'dark');
            icon.classList.replace('fa-moon-o', 'fa-sun-o');
        } else {
            localStorage.setItem('theme', 'light');
            icon.classList.replace('fa-sun-o', 'fa-moon-o');
        }
    });
}

function initMap() {
    map = L.map('map', {
        minZoom: 2
    }).setView([20, 0], 3);

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

    // FIX: If we are on the Details panel, pretend we are already on the target panel 
    // so we grab the existing text instead of grabbing empty strings!
    let sourcePanel = activePanel === 'details' ? panelId : activePanel;

    if (sourcePanel === 'optimal') {
        currentStart = document.getElementById('startAirport').value;
        currentEnd = document.getElementById('endAirport').value;
    } else if (sourcePanel === 'alternatives') {
        currentStart = document.getElementById('altStart').value;
        currentEnd = document.getElementById('altEnd').value;
    } else if (sourcePanel === 'reachability') {
        currentStart = document.getElementById('bfsStart').value;
        currentEnd = document.getElementById('endAirport').value || document.getElementById('altEnd').value;
    }

    if (panelId !== 'multicity' && panelId !== 'details') {
        document.getElementById('startAirport').value = currentStart;
        document.getElementById('altStart').value = currentStart;
        document.getElementById('bfsStart').value = currentStart;
        document.getElementById('endAirport').value = currentEnd;
        document.getElementById('altEnd').value = currentEnd;
    }

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

    const collapseExpanded = document.querySelector('div[value="panel-' + panelId + '"].expand');
    if (collapseExpanded) {
        // Auto-expand if collapsed when clicking header
        if (typeof collapsePanel === 'function') {
            collapsePanel(collapseExpanded);
        } else {
            document.querySelector('div[value="panel-' + panelId + '"].floating').classList.add("active");
        }
    }

    activePanel = panelId;

    clearMap();
    if (panelId !== 'multicity') {
        handleInputChange({ target: { value: currentStart } }, 'startAirport');
        handleInputChange({ target: { value: currentEnd } }, 'endAirport');
    }
}

// ===== CLEAR ALL INPUTS UTILITY =====
window.clearAllInputs = function () {
    document.getElementById('startAirport').value = '';
    document.getElementById('endAirport').value = '';
    document.getElementById('altStart').value = '';
    document.getElementById('altEnd').value = '';
    document.getElementById('bfsStart').value = '';

    document.querySelectorAll('.multi-city-input').forEach(input => input.value = '');

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
    document.querySelectorAll(".floating .box").forEach(b => b.innerHTML = "");
    document.querySelectorAll('.floating').forEach(f => f.classList.remove('active'));

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
    if (activePanel === 'optimal' && document.getElementById('resultCard').style.display === 'block') {
        // Prevent clearing map during standard typing if result is shown
    }

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
// MASSIVE RENDER MAP UPGRADE (SOLVES OVERLAPPING / CLUTTER)
// ===================================================================
function renderMap(data) {
    const { path, path_names, coords, requested_stops } = data;
    const allLatLngs = [];

    // 1. Dynamic Color Palette for Multi-City Legs
    const legStyles = [
        { color: '#00E5FF', pulse: '#001A4D' }, // Cyan
        { color: '#FF00FF', pulse: '#4B0082' }, // Magenta
        { color: '#39FF14', pulse: '#006400' }, // Neon Green
        { color: '#FF9900', pulse: '#8B4500' }, // Orange
        { color: '#FF0000', pulse: '#8B0000' }  // Red
    ];

    let segments = [];
    let currentSegmentLatLngs = [];
    let currentLegIndex = 0;
    let stopNumber = 1;

    let prevLng = null;

    path.forEach((iata, index) => {
        const fullName = path_names[index];
        let [lat, lng] = coords[iata];

        if (prevLng !== null) {
            let diff = lng - prevLng;
            while (diff > 180) {
                lng -= 360;
                diff = lng - prevLng;
            }
            while (diff < -180) {
                lng += 360;
                diff = lng - prevLng;
            }
        }
        prevLng = lng;

        let renderLat = lat;
        let renderLng = lng;
        if (requested_stops && currentLegIndex > 0) {
            renderLat += (currentLegIndex * 0.03);
            renderLng += (currentLegIndex * 0.03);
        }

        const lineLatLng = [renderLat, renderLng];
        allLatLngs.push([lat, lng]);
        currentSegmentLatLngs.push(lineLatLng);

        const isRequested = requested_stops && requested_stops.includes(iata);
        const isMultiCity = !!requested_stops;

        let markerHtml = '';
        let popupText = '';

        if (isRequested || index === 0 || index === path.length - 1) {
            if (isMultiCity) {
                let bg = '#3b82f6';
                if (index === 0) bg = '#22c55e';
                else if (index === path.length - 1) bg = '#ef4444';

                markerHtml = `<div class="premium-marker" style="background: ${bg}; color: white; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); width: 34px; height: 34px; display:flex; align-items:center; justify-content:center; border-radius:50%; font-weight:bold; font-size:16px; margin-top:-17px; margin-left:-17px; z-index: 1000;">${stopNumber}</div>`;
                popupText = `<b>${fullName}</b><br>Itinerary Stop ${stopNumber}`;
                stopNumber++;
            } else {
                if (index === 0) {
                    markerHtml = `<div class="premium-marker marker-start"><i class="fa fa-plane"></i></div>`;
                    popupText = `<b>${fullName}</b><br>Departure`;
                } else if (index === path.length - 1) {
                    markerHtml = `<div class="premium-marker marker-end"><i class="fa fa-plane"></i></div>`;
                    popupText = `<b>${fullName}</b><br>Arrival`;
                }
            }
        } else {
            if (isMultiCity) {
                markerHtml = `<div style="background: white; border: 3px solid #f97316; width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); margin-top:-7px; margin-left:-7px;"></div>`;
            } else {
                markerHtml = `<div class="marker-layover"><i class="fa fa-map-marker"></i></div>`;
            }
            popupText = `<b>${fullName}</b><br>Layover`;
        }

        const marker = L.marker([lat, lng], {
            icon: L.divIcon({ html: markerHtml, className: '' })
        }).addTo(map).bindPopup(popupText);

        markers.push(marker);

        if (index > 0 && requested_stops && isRequested) {
            segments.push({
                latlngs: [...currentSegmentLatLngs],
                style: legStyles[currentLegIndex % legStyles.length],
                legNumber: currentLegIndex + 1
            });
            currentLegIndex++;
            currentSegmentLatLngs = [lineLatLng];
        }
    });

    if (segments.length === 0 && currentSegmentLatLngs.length > 1) {
        segments.push({
            latlngs: currentSegmentLatLngs,
            style: legStyles[0],
            legNumber: 1
        });
    }

    const pathLayers = [];

    segments.forEach(seg => {
        let lineLayer;
        if (typeof L.polyline.antPath === 'function') {
            lineLayer = L.polyline.antPath(seg.latlngs, {
                "delay": 400,
                "dashArray": [15, 30],
                "weight": 5,
                "color": seg.style.color,
                "pulseColor": seg.style.pulse,
                "paused": false,
                "reverse": false,
                "hardwareAccelerated": true
            });
        } else {
            lineLayer = L.polyline(seg.latlngs, { color: seg.style.color, weight: 4 });
        }

        let popupMsg = requested_stops ?
            `<b>Leg ${seg.legNumber}</b><br>Click markers for airport info.` :
            `<b>Route</b><br>Distance: ${data.total_distance}km<br>Price: $${data.total_price}`;

        lineLayer.bindPopup(popupMsg);
        pathLayers.push(lineLayer);
    });

    routeLine = L.layerGroup(pathLayers).addTo(map);
    map.fitBounds(allLatLngs, { padding: [50, 50] });
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
        if (routeLine) fadeOutAndRemove(routeLine);
        markers.forEach(fadeOutAndRemove);
        markers = [];
        renderMap(routeData);

        document.querySelectorAll('.result-card').forEach(card => {
            card.classList.remove('selected');
        });
        cardElement.classList.add('selected');
    });

    showDetailsBtn.addEventListener('click', () => {
        showRouteDetails(routeData, 'panel-optimal');
    });
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

        document.querySelector(".tab-btn.cheapest").click();

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
    if (altRoutesData.length > 0) {
        selectAltRoute(0);
    }
};

function renderAltRoutesList() {
    const container = document.getElementById('altRoutesList');
    if (!container) return;
    container.innerHTML = '';

    const floatContainer = document.querySelector('div[value="panel-alternatives"] .box');
    if (floatContainer) floatContainer.innerHTML = '';

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
            <div class="action-buttons">
                <div class="showRoute" onclick="selectAltRoute(${idx})">Show on Map</div>
                <div class="showDetails" onclick="showRouteDetails(altRoutesData[${idx}], 'panel-alternatives')">More Details</div>
            </div>
        `;

        container.appendChild(card);
        const cardClone = card.cloneNode(true);
        if (floatContainer) floatContainer.appendChild(cardClone);
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

window.goBackFromDetails = function () {
    // Your code stores the origin as "panel-optimal", "panel-multicity", etc.
    // The switchPanel function just wants the word "optimal" or "multicity".
    // So, we quickly chop off the "panel-" part and switch to it!
    const targetPanel = originalPanelForDetails.replace('panel-', '');
    switchPanel(targetPanel);
};

window.showRouteDetails = function (routeData, originPanelId) {
    if (typeof switchPanel !== 'function') { console.error('switchPanel not defined'); return; }

    // Store origin panel if provided (from button click)
    if (originPanelId) originalPanelForDetails = originPanelId;

    switchPanel('details');
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
        const airport = (typeof globalAirports !== 'undefined') ? globalAirports.find(ap => ap.text && ap.text.includes(`(${airportCode})`)) : null;

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
                const ap1 = (typeof globalAirports !== 'undefined') ? globalAirports.find(ap => ap.text && ap.text.includes(`(${nodes[i]})`)) : null;
                const ap2 = (typeof globalAirports !== 'undefined') ? globalAirports.find(ap => ap.text && ap.text.includes(`(${nodes[i + 1]})`)) : null;

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

    if (typeof renderMap === 'function') {
        renderMap(routeData);
    }

    const floatPanel = document.querySelector('div[value="panel-details"].floating');
    if (floatPanel) {
        // Try to FIND the original card to copy its header (title and badges)
        const originPanel = document.getElementById(originalPanelForDetails);
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

        // Sync the arrow cards too!
        // Sync the arrow cards too!
        const boxContainer = floatPanel.querySelector('.box');
        const originFloatPanel = document.querySelector(`div[value="${originalPanelForDetails}"].floating`);
        const originMainPanel = document.getElementById(originalPanelForDetails);

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

                        // FIX: Re-attach the click events to the cloned buttons!
                        if (detailsBtn) {
                            detailsBtn.style.cursor = "pointer";
                            detailsBtn.onclick = function () {
                                if (originMainPanel) {
                                    const realCards = originMainPanel.querySelectorAll('.result-card');
                                    if (realCards[idx]) {
                                        const realBtn = realCards[idx].querySelector('.showDetails');
                                        if (realBtn) realBtn.click(); // Triggers your original showRouteDetails logic perfectly
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
                                        if (realBtn) realBtn.click(); // Triggers your original map rendering
                                    }
                                }
                            };
                        }
                    }
                });
                // --- NEW ARROW HIDING LOGIC ---
                // If there is only 1 card (like in Multi-City), hide the navigation arrows
                const leftArrow = floatPanel.querySelector('.button.left');
                const rightArrow = floatPanel.querySelector('.button.right');

                if (sideCards.length <= 1) {
                    if (leftArrow) leftArrow.style.display = 'none';
                    if (rightArrow) rightArrow.style.display = 'none';
                } else {
                    if (leftArrow) leftArrow.style.display = ''; // Reverts to CSS default
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

window.queryAlternativeRoutes = queryAlternativeRoutes;


// ===================================================================
// PANEL 3: REACHABILITY MAP UPGRADED (SOLVES CHIP CLICK ISSUE)
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
        if (floatContainer) floatContainer.appendChild(floatGroup);
    }
}

function handleBfsChipClick(endIata, endName) {
    const startRaw = document.getElementById('bfsStart').value;
    if (!startRaw) return;

    bfsMarkers.forEach(layer => map.removeLayer(layer));
    bfsMarkers = [];
    document.getElementById('bfsResultArea').style.display = 'none';

    if (tempStartMarker) map.removeLayer(tempStartMarker);
    if (tempEndMarker) map.removeLayer(tempEndMarker);

    switchPanel('optimal');

    const formattedEnd = `(${endIata}) - ${endName}`;
    document.getElementById('startAirport').value = startRaw;
    document.getElementById('endAirport').value = formattedEnd;

    queryShortestRoute();
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

window.switchLevel = function (btn) {
    document.querySelectorAll('.bfsControls > div').forEach(d => d.classList.remove('selected'));
    btn.classList.add('selected');

    const levelClass = btn.classList[0]; // e.g., level-1
    document.querySelectorAll('.bfsGroup').forEach(group => {
        group.style.display = group.classList.contains(levelClass) ? 'block' : 'none';
    });
};

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

window.addMultiCityStop = function () {
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

        // 1. SAVE the route data globally so our button can use it!
        currentMultiCityRoute = data.route;

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
                        <button class="search-btn showDetails" onclick="showRouteDetails(currentMultiCityRoute, 'panel-multicity')" style="width: 100%; height: 40px;">
                            <i class="fa fa-list"></i> More Details
                        </button>
                    </div>
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

// ===================================================================
// FLOATING PANEL
// ===================================================================
window.collapsePanel = function (element) {
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

            if (panelID == "panel-details") {
                // FIX: Find the selected card in the floating box and make it visible again
                const floatCards = document.querySelectorAll('div[value="' + panelID + '"].floating .result-card');
                const selectedIndex = Array.from(floatCards).findIndex(div => div.classList.contains('selected'));

                if (selectedIndex !== -1) {
                    floatCards[selectedIndex].classList.add("active");
                } else if (floatCards.length > 0) {
                    floatCards[0].classList.add("active"); // Fallback to the first card
                }
            }
            else if (panelID == "panel-optimal" || panelID == "panel-alternatives") {
                const index = Array.from(panel.querySelectorAll(".result-card"))
                    .findIndex(div => div.classList.contains('selected'));
                if (index !== -1) document.querySelectorAll('div[value="' + panelID + '"].floating .result-card')[index].classList.add("active");
            }
            else if (panelID == "panel-reachability") {
                const index = Array.from(document.querySelectorAll('div[id="' + panelID + '"] .bfsControls div'))
                    .findIndex(div => div.classList.contains('selected'));
                if (index !== -1) document.querySelectorAll('div[value="' + panelID + '"].floating .result-card')[index].classList.add("active");
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

        if (panelID == "panel-optimal" || panelID == "panel-alternatives") {
            if (index !== -1) document.querySelectorAll('div[id="' + panelID + '"] .result-card')[index].querySelector(".showRoute").click();
        } else if (panelID == "panel-reachability") {
            const index = Array.from(document.querySelectorAll('div[value="' + panelID + '"].floating .result-card'))
                .findIndex(div => div.classList.contains('active'));
            if (index !== -1) document.querySelectorAll('div[id="' + panelID + '"] .bfsControls div')[index].click();
        }
    }
}

window.floatCardControl = function (element, direction) {
    const box = element.parentElement.querySelector(".box");
    const cards = Array.from(box.querySelectorAll(".result-card"));
    if (cards.length === 0) return;

    const activeIndex = cards.findIndex(c => c.classList.contains('active'));
    if (activeIndex === -1) return;

    let newIndex = activeIndex + direction;
    if (newIndex >= cards.length) newIndex = 0;
    if (newIndex < 0) newIndex = cards.length - 1;

    cards[activeIndex].classList.remove('active');
    cards[newIndex].classList.add('active');

    const panelID = element.parentElement.getAttribute("value");

    // Original switching logic
    if (panelID === "panel-details") {
        // Find the index in the ORIGINAL panel floating cards
        const originFloat = document.querySelector(`div[value="${originalPanelForDetails}"].floating`);
        if (originFloat) {
            floatCardControl(originFloat.querySelector('.button.right'), direction);
        }
    } else {
        const showRoute = cards[newIndex].querySelector(".showRoute") || cards[newIndex].querySelector(".showDetails");
        if (showRoute) {
            // Try to trigger the click on the panel side version for consistency
            const realPanel = document.getElementById(panelID);
            if (realPanel) {
                const realCards = realPanel.querySelectorAll('.result-card');
                if (realCards[newIndex]) {
                    const btn = realCards[newIndex].querySelector('.showRoute') || realCards[newIndex].querySelector('.showDetails');
                    if (btn) {
                        btn.click();
                        // If we are in details mode, RE-TRIGGER showRouteDetails to update the timeline!
                        if (activePanel === 'details') {
                            const routeData = panelID === 'panel-optimal' ? currentRoutesData[newIndex === 0 ? 'time' : (newIndex === 1 ? 'distance' : 'price')] : altRoutesData[newIndex];
                            if (routeData) showRouteDetails(routeData);
                        }
                    }
                }
            } else {
                showRoute.click();
            }
        }
    }
}

/**
 * Format minutes into "Xh Ym"
 */
function formatTime(totalMinutes) {
    if (!totalMinutes) return '0h 0m';
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${m}m`;
}

import { state } from './state.js';
import { fadeOutAndRemove, getDistanceFromLatLonInKm } from './utils.js';

// ===== CORE INITIALIZATION =====
export function initMap() {
    state.map = L.map('map', {
        minZoom: 2
    }).setView([20, 0], 3);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.map);

    state.map.on('click', handleMapClick);
}

export function clearMap() {
    state.markers.forEach(fadeOutAndRemove);
    state.markers = [];

    if (state.routeLine) fadeOutAndRemove(state.routeLine);
    state.routeLine = null;

    if (state.tempStartMarker) fadeOutAndRemove(state.tempStartMarker);
    if (state.tempEndMarker) fadeOutAndRemove(state.tempEndMarker);
    state.tempStartMarker = null;
    state.tempEndMarker = null;

    state.bfsMarkers.forEach(fadeOutAndRemove);
    state.bfsMarkers = [];
    state.bfsCircles.forEach(fadeOutAndRemove);
    state.bfsCircles = [];
}

export function resetRouteDisplay() {
    document.getElementById('resultCard').style.display = 'none';
    if (state.routeLine) {
        fadeOutAndRemove(state.routeLine);
        state.routeLine = null;
    }
    state.markers.forEach(fadeOutAndRemove);
    state.markers = [];
    state.multiCityMarkers.forEach(fadeOutAndRemove);
    state.multiCityMarkers = [];
}

export function recenterMap() {
    if (!state.map) return;

    // 1. If we have a computed route being displayed, fit to it
    if (state.routeLine && state.map.hasLayer(state.routeLine)) {
        let routeLatLngs = [];
        
        // Extract latlngs from all polyline layers in the routeLayer group
        state.routeLine.eachLayer(layer => {
            if (layer.getLatLngs) {
                const latlngs = layer.getLatLngs();
                if (Array.isArray(latlngs)) {
                    // Check if it's a nested array (multi-polyline)
                    if (Array.isArray(latlngs[0])) {
                        latlngs.forEach(inner => routeLatLngs = routeLatLngs.concat(inner));
                    } else {
                        routeLatLngs = routeLatLngs.concat(latlngs);
                    }
                }
            }
        });

        if (routeLatLngs.length > 0) {
            state.map.fitBounds(routeLatLngs, { padding: [50, 50], duration: 1.5 });
            return;
        }
    }

    // 2. If we have temporary multi-city markers, fit to them
    if (state.multiCityMarkers.length > 0) {
        const mcLatLngs = state.multiCityMarkers.map(m => m.getLatLng());
        if (mcLatLngs.length > 1) {
            state.map.fitBounds(mcLatLngs, { padding: [60, 60], duration: 1.5 });
        } else {
            state.map.flyTo(mcLatLngs[0], 5, { duration: 1.5 });
        }
        return;
    }

    // 3. Fallback to start/end markers if they exist
    let targets = [];
    if (state.tempStartMarker) targets.push(state.tempStartMarker.getLatLng());
    if (state.tempEndMarker) targets.push(state.tempEndMarker.getLatLng());

    if (targets.length > 1) {
        state.map.fitBounds(targets, { padding: [80, 80], duration: 1.5 });
    } else if (targets.length === 1) {
        state.map.flyTo(targets[0], 5, { duration: 1.5 });
    } else {
        // Default View
        state.map.flyTo([20, 0], 3, { duration: 1.5 });
    }
}

// --- SMART RADAR MAP CLICK LOGIC ---
export function handleMapClick(e) {
    const clickLat = e.latlng.lat;
    const clickLng = e.latlng.lng;

    const nearbyAirports = state.globalAirports.filter(airport => {
        const dist = getDistanceFromLatLonInKm(clickLat, clickLng, airport.lat, airport.lng);
        return dist <= 150;
    });

    if (nearbyAirports.length === 0) {
        L.popup()
            .setLatLng(e.latlng)
            .setContent("<div class='custom-map-popup'><b>No airports found within 150km.</b><br>Try clicking closer to a city!</div>")
            .openOn(state.map);
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

    if (state.activePanel === 'multicity') {
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
        .openOn(state.map);
}

export function setMapSelection(inputId) {
    resetRouteDisplay();
    // hideError
    const errorEl = document.getElementById('errorMsg');
    if (errorEl) errorEl.style.display = 'none';

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
                if (window.addMultiCityStop) window.addMultiCityStop();
                const newInputs = document.querySelectorAll('.multi-city-input');
                newInputs[newInputs.length - 1].value = selectedText;
            }
        }
        state.map.closePopup();
        if (window.updateMultiCityMarkers) window.updateMultiCityMarkers();
        return;
    }

    if (state.activePanel === 'optimal') {
        document.getElementById(inputId).value = selectedText;
    } else if (state.activePanel === 'alternatives') {
        document.getElementById(inputId === 'startAirport' ? 'altStart' : 'altEnd').value = selectedText;
    } else if (state.activePanel === 'reachability' && inputId === 'startAirport') {
        document.getElementById('bfsStart').value = selectedText;
    }

    state.map.closePopup();

    if (inputId === 'startAirport') {
        if (state.tempStartMarker) fadeOutAndRemove(state.tempStartMarker);
        state.tempStartMarker = L.marker([lat, lng], {
            icon: L.divIcon({ html: `<div class="premium-marker marker-start"><i class="fa fa-plane"></i></div>`, className: '' })
        }).addTo(state.map).bindTooltip("Departure Set", { permanent: true, direction: "top" }).openTooltip();
    } else {
        if (state.tempEndMarker) fadeOutAndRemove(state.tempEndMarker);
        state.tempEndMarker = L.marker([lat, lng], {
            icon: L.divIcon({ html: `<div class="premium-marker marker-end"><i class="fa fa-plane"></i></div>`, className: '' })
        }).addTo(state.map).bindTooltip("Arrival Set", { permanent: true, direction: "top" }).openTooltip();
    }

    state.map.flyTo([lat, lng], 5, { duration: 1.5 });
}

// ===================================================================
// MASSIVE RENDER MAP UPGRADE (SOLVES OVERLAPPING / CLUTTER)
// ===================================================================
export function renderMap(data) {
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
        }).addTo(state.map).bindPopup(popupText);

        state.markers.push(marker);

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

    state.routeLine = L.layerGroup(pathLayers).addTo(state.map);
    state.map.fitBounds(allLatLngs, { padding: [50, 50] });
}

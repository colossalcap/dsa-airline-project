import { state } from './state.js';
import { fadeOutAndRemove } from './utils.js';
import { clearMap, resetRouteDisplay } from './map.js';

export function setupDarkMode() {
    const toggleBtn = document.getElementById('darkModeToggle');
    if (!toggleBtn) return;

    const icon = toggleBtn.querySelector('i');

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

export function hideError() {
    ['errorMsg', 'altErrorMsg', 'bfsErrorMsg', 'multiCityErrorMsg'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

export function showError(msg) {
    document.getElementById('errorMsg').innerText = msg;
    document.getElementById('errorMsg').style.display = 'block';
    document.getElementById('resultCard').style.display = 'none';
    clearMap();
}

export function handleInputChange(e, inputId) {
    if (state.activePanel === 'optimal' && document.getElementById('resultCard').style.display === 'block') {
        // Prevent clearing map during standard typing if result is shown
    }

    hideError();

    const val = e.target.value;
    const matchedAirport = state.globalAirports.find(ap => ap.text === val);

    if (matchedAirport) {
        const lat = matchedAirport.lat;
        const lng = matchedAirport.lng;

        if (inputId === 'startAirport') {
            if (state.tempStartMarker) fadeOutAndRemove(state.tempStartMarker);
            state.tempStartMarker = L.marker([lat, lng], {
                icon: L.divIcon({ html: `<div class="premium-marker marker-start"><i class="fa fa-plane-departure"></i></div>`, className: '' })
            }).addTo(state.map).bindTooltip("Departure Set", { permanent: true, direction: "top" }).openTooltip();
        } else {
            if (state.tempEndMarker) fadeOutAndRemove(state.tempEndMarker);
            state.tempEndMarker = L.marker([lat, lng], {
                icon: L.divIcon({ html: `<div class="premium-marker marker-end"><i class="fa fa-plane-arrival"></i></div>`, className: '' })
            }).addTo(state.map).bindTooltip("Arrival Set", { permanent: true, direction: "top" }).openTooltip();
        }
        state.map.flyTo([lat, lng], 5, { duration: 1.5 });
    } else {
        if (inputId === 'startAirport' && state.tempStartMarker) {
            fadeOutAndRemove(state.tempStartMarker);
            state.tempStartMarker = null;
        } else if (inputId === 'endAirport' && state.tempEndMarker) {
            fadeOutAndRemove(state.tempEndMarker);
            state.tempEndMarker = null;
        }
    }
}

export function setupInputListeners() {
    document.getElementById('startAirport').addEventListener('input', (e) => handleInputChange(e, 'startAirport'));
    document.getElementById('endAirport').addEventListener('input', (e) => handleInputChange(e, 'endAirport'));

    document.querySelectorAll('.multi-city-input').forEach(input => {
        if(window.updateMultiCityMarkers) input.addEventListener('input', window.updateMultiCityMarkers);
    });
}

// ===== PANEL SWITCHING & SYNCING =====
export function switchPanel(panelId, skipClear = false) {
    let currentStart = "", currentEnd = "";

    let sourcePanel = state.activePanel === 'details' ? panelId : state.activePanel;

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

    const collapseBtn = document.querySelector('div[value="panel-' + panelId + '"]');
    if (collapseBtn) collapseBtn.style.display = 'block';

    const collapseExpanded = document.querySelector('div[value="panel-' + panelId + '"].expand');
    if (collapseExpanded) {
        if (!skipClear) {
            if (window.collapsePanel) window.collapsePanel(collapseExpanded);
        } else {
            const floatPanel = document.querySelector('div[value="panel-' + panelId + '"].floating');
            if (floatPanel && floatPanel.querySelector('.box div') != null) {
                floatPanel.classList.add("active");
            }
        }
    }

    state.activePanel = panelId;

    if (!skipClear) clearMap();
    if (panelId !== 'multicity') {
        handleInputChange({ target: { value: currentStart } }, 'startAirport');
        handleInputChange({ target: { value: currentEnd } }, 'endAirport');
    }
}

// ===== CLEAR ALL INPUTS UTILITY =====
export function clearAllInputs() {
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

    clearMap();
    resetRouteDisplay();
    state.multiCityMarkers.forEach(fadeOutAndRemove);
    state.multiCityMarkers = [];
}

export function collapsePanel(element) {
    const panelID = element.getAttribute("value");
    let panel = document.getElementById(panelID);

    if (element.classList.contains("collapse")) {
        panel.classList.add("collapse");
        element.classList.remove("collapse");
        element.classList.add("expand");
        element.querySelector("span").textContent = "Expand";

        const floatPanel = document.querySelector('div[value="' + panelID + '"].floating');
        if (floatPanel && floatPanel.querySelector('.box div') != null) {
            floatPanel.classList.add("active");

            // Hide arrows if only 1 card (or fewer) exists
            const cards = floatPanel.querySelectorAll('.result-card');
            const leftBtn = floatPanel.querySelector('.button.left');
            const rightBtn = floatPanel.querySelector('.button.right');

            if (cards.length <= 1) {
                if (leftBtn) leftBtn.style.display = 'none';
                if (rightBtn) rightBtn.style.display = 'none';
            } else {
                if (leftBtn) leftBtn.style.display = '';
                if (rightBtn) rightBtn.style.display = '';
            }

            document.querySelectorAll('div[value="' + panelID + '"].floating .result-card').forEach(div => div.classList.remove('active'));

            if (panelID == "panel-details") {
                const floatCards = document.querySelectorAll('div[value="' + panelID + '"].floating .result-card');
                const selectedIndex = Array.from(floatCards).findIndex(div => div.classList.contains('selected'));
                if (selectedIndex !== -1) {
                    floatCards[selectedIndex].classList.add("active");
                } else if (floatCards.length > 0) {
                    floatCards[0].classList.add("active");
                }
            }
            else if (panelID == "panel-optimal" || panelID == "panel-alternatives" || panelID == "panel-multicity") {
                const index = Array.from(panel.querySelectorAll(".result-card"))
                    .findIndex(div => div.classList.contains('selected'));
                if (index !== -1) {
                    const floatCards = document.querySelectorAll('div[value="' + panelID + '"].floating .result-card');
                    if (floatCards[index]) floatCards[index].classList.add("active");
                }
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

        if (panelID == "panel-optimal" || panelID == "panel-alternatives" || panelID == "panel-multicity") {
            if (index !== -1) {
                const realCards = document.querySelectorAll('div[id="' + panelID + '"] .result-card');
                if (realCards[index]) {
                    realCards[index].classList.add('selected'); // Ensure selection is maintained
                    const btn = realCards[index].querySelector(".showRoute");
                    if (btn) btn.click();
                }
            }
        } else if (panelID == "panel-reachability") {
            const bfsIndex = Array.from(document.querySelectorAll('div[value="' + panelID + '"].floating .result-card'))
                .findIndex(div => div.classList.contains('active'));
            if (bfsIndex !== -1) document.querySelectorAll('div[id="' + panelID + '"] .bfsControls div')[bfsIndex].click();
        }
    }
}

export function floatCardControl(element, direction) {
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

    if (panelID === "panel-details") {
        const originFloat = document.querySelector(`div[value="${state.originalPanelForDetails}"].floating`);
        if (originFloat) {
            floatCardControl(originFloat.querySelector('.button.right'), direction);
        }
    } else {
        const showRoute = cards[newIndex].querySelector(".showRoute") || cards[newIndex].querySelector(".showDetails");
        if (showRoute) {
            const realPanel = document.getElementById(panelID);
            if (realPanel) {
                const realCards = realPanel.querySelectorAll('.result-card');
                if (realCards[newIndex]) {
                    const btn = realCards[newIndex].querySelector('.showRoute') || realCards[newIndex].querySelector('.showDetails');
                    if (btn) {
                        btn.click();
                        if (state.activePanel === 'details') {
                            let routeData = null;
                            if (panelID === 'panel-optimal') {
                                const activeCard = cards[newIndex];
                                const criteria = ['time', 'distance', 'price', 'fewest'].find(c => activeCard.classList.contains(c));
                                if (criteria === 'fewest') routeData = state.currentRoutesData['connections'];
                                else if (criteria) routeData = state.currentRoutesData[criteria];
                            } else if (panelID === 'panel-alternatives') {
                                routeData = state.altRoutesData[newIndex];
                            }
                            
                            if (routeData && window.showRouteDetails) window.showRouteDetails(routeData);
                        }
                    }
                }
            } else {
                showRoute.click();
            }
        }
    }
}
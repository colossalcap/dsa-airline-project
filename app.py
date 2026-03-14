from flask import Flask, render_template, request, jsonify
import json
import os
import math
import heapq
import sys
import random
import time
from collections import deque

sys.setrecursionlimit(10000)
sys.stdout = sys.stderr  # Ensure prints appear alongside Flask debug output

app = Flask(__name__)

flight_graph = {}
airport_names = {}  
coords_dict = {}

# Calculate distance between two lat/lng points in km
def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371.0 
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    return round(R * c, 2)

def load_flight_data():
    global flight_graph, airport_names, coords_dict
    data_path = os.path.join(os.path.dirname(__file__), "data", "airline_routes.json")
    if not os.path.exists(data_path):
        print(f"JSON file not found: {data_path}")
        return
    
    try:
        with open(data_path, "r", encoding="utf-8") as f:
            flight_data = json.load(f)  
        
        adjacency_list = {}
        
        for iata_code, airport in flight_data.items():
            iata = iata_code.strip()
            if not iata: continue
            
            name = airport.get("name", "").strip()
            city = airport.get("city", "").strip()
            country = airport.get("country", "").strip()
            
            if not city:
                city = name.split(" Airport")[0].split(" International")[0].strip()
            
            hub_patch = {
                "LHR": "London", "LGW": "London", "STN": "London", "LTN": "London", "LCY": "London",
                "JFK": "New York", "LGA": "New York", "EWR": "New York",
                "HND": "Tokyo", "NRT": "Tokyo", 
                "CDG": "Paris", "ORY": "Paris",
                "DXB": "Dubai", "SIN": "Singapore", "LAX": "Los Angeles", 
                "SFO": "San Francisco", "ORD": "Chicago", "ATL": "Atlanta"
            }
            if iata in hub_patch:
                city = hub_patch[iata]
            
            display_country = f", {country}" if country and country.lower() != city.lower() else ""
            
            display_name = name
            if city and display_name.lower().startswith(city.lower()):
                temp_name = display_name[len(city):].strip(' -,')
                invalid_leftovers = ["airport", "intl", "international", "international airport", "regional"]
                if temp_name and temp_name.lower() not in invalid_leftovers:
                    display_name = temp_name
            
            if not display_name:
                display_name = "Airport"

            airport_names[iata] = f"{city} ({iata}) - {display_name}{display_country}"

            try:
                lat = float(airport.get("latitude", 0.0))
                lng = float(airport.get("longitude", 0.0))
            except:
                lat, lng = 0.0, 0.0
            coords_dict[iata] = (lat, lng)

        for iata_code, airport in flight_data.items():
            iata = iata_code.strip()
            if not iata: continue
            
            lat, lng = coords_dict[iata]
            routes = airport.get("routes", [])
            route_details = []
            
            for route_obj in routes:
                route_iata = route_obj.get("iata", "").strip()
                duration = route_obj.get("min", 10)
                if not route_iata or route_iata not in coords_dict: continue
                
                target_lat, target_lng = coords_dict[route_iata]
                
                distance = haversine_distance(lat, lng, target_lat, target_lng)
                price = round(50 + (distance * 0.12) + (duration * 0.05), 2) 
                
                route_details.append((route_iata, duration, distance, price))
            
            if route_details:
                adjacency_list[iata] = route_details
        
        flight_graph = adjacency_list
        print(f"Loaded {len(flight_graph)} airports with cleaned formatting.")
    except Exception as e:
        print(f"Load JSON failed: {str(e)}")

load_flight_data()

# ============================================================
# FEATURE 3: QUICK SORT (Divide & Conquer) & BINARY SEARCH
# ============================================================

def quick_sort(arr, key_func):
    """Quick Sort implementation using randomized pivot (Lomuto partition).
    Sorts a list of items in-place based on a key function.
    Randomized pivot avoids worst-case O(n^2) recursion on sorted input.
    Syllabus Topics: Divide & Conquer, Sorting, Arrays.
    """
    partition_count = [0]
    comparison_count = [0]

    def _partition(items, low, high):
        # Randomized pivot: swap a random element into the pivot position
        rand_idx = random.randint(low, high)
        items[rand_idx], items[high] = items[high], items[rand_idx]

        pivot = key_func(items[high])
        i = low - 1
        for j in range(low, high):
            comparison_count[0] += 1
            if key_func(items[j]) <= pivot:
                i += 1
                items[i], items[j] = items[j], items[i]
        items[i + 1], items[high] = items[high], items[i + 1]
        partition_count[0] += 1
        return i + 1

    def _quick_sort_recursive(items, low, high):
        if low < high:
            pi = _partition(items, low, high)
            _quick_sort_recursive(items, low, pi - 1)
            _quick_sort_recursive(items, pi + 1, high)

    print(f"  [QUICK SORT] Starting sort on {len(arr)} items...")
    t_start = time.time()
    if len(arr) > 1:
        _quick_sort_recursive(arr, 0, len(arr) - 1)
    elapsed = (time.time() - t_start) * 1000
    print(f"  [QUICK SORT] Completed: {partition_count[0]} partitions, {comparison_count[0]} comparisons in {elapsed:.2f}ms")
    return arr


def binary_search(sorted_list, target):
    """Binary Search implementation to find a target IATA code.
    Returns the index if found, -1 otherwise.
    Syllabus Topics: Divide & Conquer, Searching, Arrays.
    """
    low = 0
    high = len(sorted_list) - 1
    steps = 0
    print(f"  [BINARY SEARCH] Searching for '{target}' in {len(sorted_list)} sorted items...")
    while low <= high:
        mid = (low + high) // 2
        steps += 1
        print(f"    Step {steps}: low={low}, mid={mid}, high={high} | Comparing '{sorted_list[mid]}' with '{target}'")
        if sorted_list[mid] == target:
            print(f"  [BINARY SEARCH] FOUND '{target}' at index {mid} in {steps} steps")
            return mid
        elif sorted_list[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    print(f"  [BINARY SEARCH] '{target}' NOT FOUND after {steps} steps")
    return -1


# Pre-compute sorted IATA codes list for binary search after data loads
sorted_iata_codes = []

def build_sorted_iata_list():
    """Build a sorted list of all valid IATA codes using Quick Sort."""
    global sorted_iata_codes
    codes = [code for code in flight_graph.keys()]
    quick_sort(codes, key_func=lambda x: x)
    sorted_iata_codes = codes

# Build the sorted IATA list now that all functions are defined
build_sorted_iata_list()


# ============================================================
# DIJKSTRA'S ALGORITHM (Existing - Shortest Path)
# ============================================================
def find_optimal_route(start_iata, end_iata, criteria='time'):
    print(f"  [DIJKSTRA] Running Dijkstra's algorithm: {start_iata} -> {end_iata} (criteria: {criteria})")
    t_start = time.time()
    queue = [(0, start_iata, [start_iata], 0, 0, 0)]
    visited = set()
    nodes_explored = 0
    
    while queue:
        cost, current, path, tot_time, tot_dist, tot_price = heapq.heappop(queue)
        
        if current in visited:
            continue
        visited.add(current)
        nodes_explored += 1
        
        if current == end_iata:
            elapsed = (time.time() - t_start) * 1000
            print(f"  [DIJKSTRA] Route FOUND! Explored {nodes_explored} nodes in {elapsed:.2f}ms")
            print(f"  [DIJKSTRA] Path: {' -> '.join(path)}")
            return path, tot_time, tot_dist, tot_price
            
        if current in flight_graph:
            for neighbor, dur, dist, price in flight_graph[current]:
                if neighbor not in visited:
                    if criteria == 'time': weight = dur
                    elif criteria == 'distance': weight = dist
                    elif criteria == 'price': weight = price
                    elif criteria == 'connections': weight = 1 
                    else: weight = dur
                    
                    heapq.heappush(queue, (
                        cost + weight, 
                        neighbor, 
                        path + [neighbor], 
                        tot_time + dur, 
                        round(tot_dist + dist, 2), 
                        round(tot_price + price, 2)
                    ))
    elapsed = (time.time() - t_start) * 1000
    print(f"  [DIJKSTRA] No route found after exploring {nodes_explored} nodes in {elapsed:.2f}ms")
    return None, 0, 0, 0


# ============================================================
# FEATURE 1: ALTERNATIVE ROUTE FINDER (DFS & Backtracking)
# ============================================================

def find_all_routes_dfs(start, end, max_connections=3):
    """Find all possible routes between two airports using DFS with Backtracking.
    max_connections limits the maximum number of flights (edges) in a route.
    Syllabus Topics: Graphs (DFS), Recursion, Backtracking.
    """
    all_routes = []
    recursion_calls = [0]
    backtracks = [0]

    def dfs_backtrack(current, destination, path, visited, tot_time, tot_dist, tot_price):
        recursion_calls[0] += 1

        # Base case: reached the destination
        if current == destination:
            all_routes.append({
                "path": list(path),
                "total_time": tot_time,
                "total_distance": round(tot_dist, 2),
                "total_price": round(tot_price, 2)
            })
            return

        # Pruning: if we've used max_connections flights already, stop
        if len(path) - 1 >= max_connections:
            return

        # Explore neighbors (DFS)
        if current in flight_graph:
            for neighbor, dur, dist, price in flight_graph[current]:
                if neighbor not in visited:
                    # Choose: add neighbor to path
                    visited.add(neighbor)
                    path.append(neighbor)

                    # Explore: recurse
                    dfs_backtrack(neighbor, destination, path, visited,
                                  tot_time + dur, tot_dist + dist, tot_price + price)

                    # Backtrack: undo the choice
                    path.pop()
                    visited.discard(neighbor)
                    backtracks[0] += 1

    print(f"  [DFS] Starting DFS with Backtracking: {start} -> {end} (max {max_connections} connections)")
    t_start = time.time()
    visited_set = {start}
    dfs_backtrack(start, end, [start], visited_set, 0, 0, 0)
    elapsed = (time.time() - t_start) * 1000

    print(f"  [DFS] Explored {recursion_calls[0]} recursive calls, {backtracks[0]} backtracks")
    print(f"  [DFS] Found {len(all_routes)} routes in {elapsed:.2f}ms")

    # Sort results by total price for a nice presentation
    all_routes.sort(key=lambda r: r["total_price"])
    return all_routes


# ============================================================
# FEATURE 2: REACHABILITY MAP (BFS)
# ============================================================

def find_reachable_airports_bfs(start, max_stops=2):
    """Find all airports reachable from a starting airport within max_stops flights.
    Uses BFS with a Queue (deque) to explore level by level.
    Syllabus Topics: Graphs (BFS), Abstract Data Types (Queues).
    """
    print(f"  [BFS] Starting BFS from '{start}' with max {max_stops} stops")
    t_start = time.time()

    # Result: dict mapping stop_number -> list of airport info
    reachable = {}
    visited = {start}
    nodes_dequeued = 0

    # BFS Queue: each element is (airport_iata, current_depth)
    queue = deque()
    queue.append((start, 0))

    while queue:
        current, depth = queue.popleft()  # FIFO - Queue behavior
        nodes_dequeued += 1

        if depth > max_stops:
            break

        if current in flight_graph:
            for neighbor, dur, dist, price in flight_graph[current]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    next_depth = depth + 1
                    if next_depth <= max_stops:
                        if next_depth not in reachable:
                            reachable[next_depth] = []
                        reachable[next_depth].append({
                            "iata": neighbor,
                            "name": airport_names.get(neighbor, neighbor)
                        })
                        queue.append((neighbor, next_depth))

    elapsed = (time.time() - t_start) * 1000
    total_found = sum(len(v) for v in reachable.values())
    print(f"  [BFS] Dequeued {nodes_dequeued} nodes, visited {len(visited)} airports")
    for level, airports in sorted(reachable.items()):
        print(f"    Level {level}: {len(airports)} airports reachable")
    print(f"  [BFS] Total reachable: {total_found} airports in {elapsed:.2f}ms")
    return reachable

@app.route('/')
def index():
    return render_template('home.html')

@app.route('/api/get_shortest_route', methods=['POST'])
def get_shortest_route():
    data = request.get_json()
    start = data.get('start', '').upper()
    end = data.get('end', '').upper()

    print("\n" + "="*60)
    print(f"[API] /api/get_shortest_route -- {start} -> {end}")
    print("="*60)
    
    if start not in flight_graph or end not in flight_graph:
        print(f"[API] ERROR: Airport IATA not found in graph")
        return jsonify({"code": 0, "msg": "Airport IATA not exists!"})
    if start == end:
        print(f"[API] ERROR: Same departure and arrival")
        return jsonify({"code": 0, "msg": "Departure and arrival cannot be the same!"})
    
    # Calculate all 4 criteria at once
    routes_data = {}
    criteria_list = ['time', 'distance', 'price', 'connections']
    t_total = time.time()
    
    for crit in criteria_list:
        path, tot_time, tot_dist, tot_price = find_optimal_route(start, end, crit)
        if path:
            routes_data[crit] = {
                "path": path,  
                "path_names": [airport_names[iata] for iata in path],
                "total_time": tot_time, 
                "total_distance": tot_dist,
                "total_price": tot_price,
                "coords": {iata: coords_dict[iata] for iata in path}
            }

    total_elapsed = (time.time() - t_total) * 1000
    print(f"[API] All 4 Dijkstra runs completed in {total_elapsed:.2f}ms")
    print("="*60 + "\n")
            
    if not routes_data:
        return jsonify({"code": 0, "msg": "No route found between these airports!"})
    
    return jsonify({"code": 1, "routes": routes_data})

@app.route('/api/airport_options')
def get_airport_options():
    """Returns a list of airports sorted alphabetically using Quick Sort.
    Syllabus Topics: Divide & Conquer, Sorting (Quick Sort), Arrays.
    """
    print("\n" + "="*60)
    print(f"[API] /api/airport_options -- Loading & sorting airports")
    print("="*60)
    try:
        options = []
        for iata, name in airport_names.items():
            if iata in flight_graph:
                lat, lng = coords_dict.get(iata, (0, 0))
                options.append({
                    "value": iata, 
                    "text": name,
                    "lat": lat,
                    "lng": lng
                })

        print(f"  Built {len(options)} airport options, now sorting...")
        # FEATURE 3: Using our custom Quick Sort instead of Python's built-in .sort()
        quick_sort(options, key_func=lambda x: x["text"])
        try:
            print(f"  First 3 airports: {[o['text'] for o in options[:3]]}")
            print(f"  Last 3 airports:  {[o['text'] for o in options[-3:]]}")
        except UnicodeEncodeError:
            print(f"  Sorted {len(options)} airports (some names contain special characters)")
        print("="*60 + "\n")
        return jsonify({"code": 1, "options": options})
    except Exception as e:
        print(f"  ERROR: {str(e)}")
        return jsonify({"code": 0, "msg": "Failed to load airports"})


@app.route('/api/validate_iata', methods=['POST'])
def validate_iata():
    """Validate if an IATA code exists using Binary Search.
    Syllabus Topics: Divide & Conquer, Searching (Binary Search), Arrays.
    """
    data = request.get_json()
    iata = data.get('iata', '').upper().strip()
    print("\n" + "="*60)
    print(f"[API] /api/validate_iata -- Validating IATA code: '{iata}'")
    print("="*60)
    if not iata:
        return jsonify({"code": 0, "msg": "No IATA code provided."})

    index = binary_search(sorted_iata_codes, iata)
    print("="*60 + "\n")
    if index != -1:
        return jsonify({
            "code": 1,
            "valid": True,
            "iata": iata,
            "name": airport_names.get(iata, iata)
        })
    else:
        return jsonify({
            "code": 1,
            "valid": False,
            "iata": iata,
            "msg": f"IATA code '{iata}' not found."
        })


@app.route('/api/alternative_routes', methods=['POST'])
def get_alternative_routes():
    """API endpoint for Feature 1: Alternative Route Finder.
    Uses DFS with Backtracking to find all routes up to max_connections.
    """
    data = request.get_json()
    start = data.get('start', '').upper()
    end = data.get('end', '').upper()
    max_conn = data.get('max_connections', 3)

    # Validate max_connections range
    try:
        max_conn = int(max_conn)
        max_conn = max(1, min(max_conn, 5))  # Clamp between 1 and 5
    except:
        max_conn = 3

    print("\n" + "="*60)
    print(f"[API] /api/alternative_routes -- {start} -> {end} (max {max_conn} connections)")
    print("="*60)

    if start not in flight_graph or end not in flight_graph:
        print(f"  ERROR: Airport IATA not found in graph")
        return jsonify({"code": 0, "msg": "Airport IATA not found!"})
    if start == end:
        print(f"  ERROR: Same departure and arrival")
        return jsonify({"code": 0, "msg": "Departure and arrival cannot be the same!"})

    routes = find_all_routes_dfs(start, end, max_conn)

    if not routes:
        print(f"  No routes found.")
        print("="*60 + "\n")
        return jsonify({"code": 0, "msg": f"No routes found within {max_conn} connections."})

    # Add display names and coords for each route
    for route in routes:
        route["path_names"] = [airport_names.get(iata, iata) for iata in route["path"]]
        route["coords"] = {iata: coords_dict[iata] for iata in route["path"]}

    print(f"  Cheapest route: {' -> '.join(routes[0]['path'])} (${routes[0]['total_price']})")
    if len(routes) > 1:
        print(f"  Most expensive: {' -> '.join(routes[-1]['path'])} (${routes[-1]['total_price']})")
    print("="*60 + "\n")
    return jsonify({"code": 1, "routes": routes, "count": len(routes)})


@app.route('/api/reachability', methods=['POST'])
def get_reachability():
    """API endpoint for Feature 2: Where Can I Go? Reachability Map.
    Uses BFS to find all reachable airports within max_stops.
    """
    data = request.get_json()
    start = data.get('start', '').upper()
    max_stops = data.get('max_stops', 2)

    try:
        max_stops = int(max_stops)
        max_stops = max(1, min(max_stops, 4))  # Clamp between 1 and 4
    except:
        max_stops = 2

    print("\n" + "="*60)
    print(f"[API] /api/reachability -- From {start}, max {max_stops} stops")
    print("="*60)

    if start not in flight_graph:
        print(f"  ERROR: Airport IATA not found in graph")
        return jsonify({"code": 0, "msg": "Airport IATA not found!"})

    reachable = find_reachable_airports_bfs(start, max_stops)

    if not reachable:
        print(f"  No reachable airports found.")
        print("="*60 + "\n")
        return jsonify({"code": 0, "msg": "No reachable airports found."})

    # Add coordinates for map rendering
    for level, airports in reachable.items():
        for ap in airports:
            ap["coords"] = coords_dict.get(ap["iata"], (0, 0))

    # Convert keys to strings for JSON serialization
    result = {str(k): v for k, v in reachable.items()}

    print("="*60 + "\n")
    return jsonify({
        "code": 1,
        "reachable": result,
        "start": start,
        "start_name": airport_names.get(start, start),
        "start_coords": coords_dict.get(start, (0, 0))
    })


if __name__ == '__main__':
    app.run(debug=True, port=5000)
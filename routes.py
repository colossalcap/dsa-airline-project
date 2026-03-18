from flask import Blueprint, render_template, request, jsonify
import time
from utils.data_store import flight_graph, airport_names, coords_dict, sorted_iata_codes
from utils.algorithms import (
    quick_sort, binary_search, find_optimal_route,
    find_all_routes_dfs, find_reachable_airports_bfs
)

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def index():
    return render_template('home.html')

@main_bp.route('/api/get_shortest_route', methods=['POST'])
def get_shortest_route():
    data = request.get_json() or {}
    start = (data.get('start') or '').upper()
    end = (data.get('end') or '').upper()

    print("\n" + "="*60)
    print(f"[API] /api/get_shortest_route -- {start} -> {end}")
    print("="*60)
    
    if start not in airport_names or end not in airport_names:
        print(f"[API] ERROR: Airport IATA not found in graph")
        return jsonify({"code": 0, "msg": "Airport IATA not exists!"})
    if start == end:
        print(f"[API] ERROR: Same departure and arrival")
        return jsonify({"code": 0, "msg": "Departure and arrival cannot be the same!"})
    
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

@main_bp.route('/api/airport_options')
def get_airport_options():
    print("\n" + "="*60)
    print(f"[API] /api/airport_options -- Loading & sorting airports")
    print("="*60)
    try:
        options = []
        for iata, name in airport_names.items():
            lat, lng = coords_dict.get(iata, (0, 0))
            options.append({
                "value": iata, 
                "text": name,
                "lat": lat,
                "lng": lng
            })

        print(f"  Built {len(options)} airport options, now sorting...")
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

@main_bp.route('/api/validate_iata', methods=['POST'])
def validate_iata():
    data = request.get_json() or {}
    iata = (data.get('iata') or '').upper().strip()
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

@main_bp.route('/api/alternative_routes', methods=['POST'])
def get_alternative_routes():
    data = request.get_json() or {}
    start = (data.get('start') or '').upper()
    end = (data.get('end') or '').upper()
    max_conn = data.get('max_connections', 3)

    try:
        max_conn = int(max_conn)
        max_conn = max(1, min(max_conn, 5))
    except:
        max_conn = 3

    print("\n" + "="*60)
    print(f"[API] /api/alternative_routes -- {start} -> {end} (max {max_conn} connections)")
    print("="*60)

    if start not in airport_names or end not in airport_names:
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

    for route in routes:
        route["path_names"] = [airport_names.get(iata, iata) for iata in route["path"]]
        route["coords"] = {iata: coords_dict[iata] for iata in route["path"]}

    print(f"  Cheapest route: {' -> '.join(routes[0]['path'])} (${routes[0]['total_price']})")
    if len(routes) > 1:
        print(f"  Most expensive: {' -> '.join(routes[-1]['path'])} (${routes[-1]['total_price']})")
    print("="*60 + "\n")
    return jsonify({"code": 1, "routes": routes, "count": len(routes)})

@main_bp.route('/api/reachability', methods=['POST'])
def get_reachability():
    data = request.get_json() or {}
    start = (data.get('start') or '').upper()
    max_stops = data.get('max_stops', 2)

    try:
        max_stops = int(max_stops)
        max_stops = max(1, min(max_stops, 4))
    except:
        max_stops = 2

    print("\n" + "="*60)
    print(f"[API] /api/reachability -- From {start}, max {max_stops} stops")
    print("="*60)

    if start not in airport_names:
        print(f"  ERROR: Airport IATA not found in graph")
        return jsonify({"code": 0, "msg": "Airport IATA not found!"})

    reachable = find_reachable_airports_bfs(start, max_stops)

    if not reachable:
        print(f"  No reachable airports found.")
        print("="*60 + "\n")
        return jsonify({"code": 0, "msg": "No reachable airports found."})

    for level, airports in reachable.items():
        for ap in airports:
            ap["coords"] = coords_dict.get(ap["iata"], (0, 0))

    result = {str(k): v for k, v in reachable.items()}

    print("="*60 + "\n")
    return jsonify({
        "code": 1,
        "reachable": result,
        "start": start,
        "start_name": airport_names.get(start, start),
        "start_coords": coords_dict.get(start, (0, 0))
    })

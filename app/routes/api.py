from flask import Blueprint, request, jsonify
from app.services.data_store import flight_graph, airport_names, coords_dict
from app.services.sorting import quick_sort
from app.services.dijkstra import find_optimal_route
from app.services.yen import find_alternative_routes_yens
from app.services.bfs import find_reachable_airports_bfs
from app.services.multi_city import plan_multi_city_route

api_bp = Blueprint('api', __name__)


@api_bp.route('/api/get_shortest_route', methods=['POST'])
def get_shortest_route():
    data = request.get_json() or {}
    start = (data.get('start') or '').upper()
    end = (data.get('end') or '').upper()

    print("\n" + "=" * 60)
    print(f"[API] /api/get_shortest_route -- {start} -> {end}")
    print("=" * 60)

    if start not in airport_names or end not in airport_names:
        return jsonify({"code": 0, "msg": "Airport IATA not exists!"})
    if start == end:
        return jsonify({"code": 0, "msg": "Departure and arrival cannot be the same!"})

    routes_data = {}
    criteria_list = ['time', 'distance', 'price', 'connections']

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

    if not routes_data:
        return jsonify({"code": 0, "msg": "No route found between these airports!"})

    return jsonify({"code": 1, "routes": routes_data})


@api_bp.route('/api/airport_options')
def get_airport_options():
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
        quick_sort(options, key_func=lambda x: x["text"])
        return jsonify({"code": 1, "options": options})
    except Exception as e:
        return jsonify({"code": 0, "msg": "Failed to load airports"})


@api_bp.route('/api/alternative_routes', methods=['POST'])
def get_alternative_routes():
    data = request.get_json() or {}
    start = (data.get('start') or '').upper()
    end = (data.get('end') or '').upper()
    max_conn = data.get('max_connections', 3)

    try:
        max_conn = int(max_conn)
        max_conn = max(1, min(max_conn, 5))
    except ValueError:
        max_conn = 3

    if start not in airport_names or end not in airport_names:
        return jsonify({"code": 0, "msg": "Airport IATA not found!"})
    if start == end:
        return jsonify({"code": 0, "msg": "Departure and arrival cannot be the same!"})

    routes = find_alternative_routes_yens(start, end, max_connections=max_conn)

    if not routes:
        return jsonify({"code": 0, "msg": f"No routes found within {max_conn} connections."})

    for route in routes:
        route["path_names"] = [airport_names.get(iata, iata) for iata in route["path"]]
        route["coords"] = {iata: coords_dict[iata] for iata in route["path"]}

    return jsonify({"code": 1, "routes": routes, "count": len(routes)})


@api_bp.route('/api/reachability', methods=['POST'])
def get_reachability():
    data = request.get_json() or {}
    start = (data.get('start') or '').upper()
    max_stops = data.get('max_stops', 2)

    try:
        max_stops = int(max_stops)
        max_stops = max(1, min(max_stops, 4))
    except ValueError:
        max_stops = 2

    if start not in airport_names:
        return jsonify({"code": 0, "msg": "Airport IATA not found!"})

    reachable = find_reachable_airports_bfs(start, max_stops)

    if not reachable:
        return jsonify({"code": 0, "msg": "No reachable airports found."})

    for level, airports in reachable.items():
        for ap in airports:
            ap["coords"] = coords_dict.get(ap["iata"], (0, 0))

    result = {str(k): v for k, v in reachable.items()}

    return jsonify({
        "code": 1,
        "reachable": result,
        "start": start,
        "start_name": airport_names.get(start, start),
        "start_coords": coords_dict.get(start, (0, 0))
    })


@api_bp.route('/api/multi_city', methods=['POST'])
def get_multi_city_route():
    data = request.get_json() or {}
    itinerary_raw = data.get('itinerary', [])

    if len(itinerary_raw) < 2:
        return jsonify({"code": 0, "msg": "Need at least 2 destinations to plan a route."})

    for ap in itinerary_raw:
        if ap not in airport_names:
            return jsonify({"code": 0, "msg": f"Airport IATA '{ap}' not found in graph!"})

    path, tot_time, tot_dist, tot_price = plan_multi_city_route(itinerary_raw, criteria='price')

    if not path:
        return jsonify({"code": 0, "msg": "Could not find a valid continuous route connecting all these cities."})

    route_data = {
        "path": path,
        "path_names": [airport_names.get(iata, iata) for iata in path],
        "total_time": tot_time,
        "total_distance": tot_dist,
        "total_price": tot_price,
        "coords": {iata: coords_dict.get(iata, (0, 0)) for iata in path},
        "requested_stops": itinerary_raw
    }

    return jsonify({"code": 1, "route": route_data})

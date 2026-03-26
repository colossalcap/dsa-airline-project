"""
Multi-City Route Planning service.
Allows sequential calculation of optimal routes through an itinerary of multiple cities
by chaining Dijkstra's algorithm.
"""
import time
from app.services.dijkstra import find_optimal_route


def plan_multi_city_route(itinerary, criteria='price'):
    """Chains Dijkstra's algorithm to calculate a continuous path through multiple cities."""
    print(f"  [MULTI-CITY] Planning route: {' -> '.join(itinerary)} (criteria: {criteria})")
    t_start = time.time()

    full_path = []
    total_time = 0
    total_distance = 0.0
    total_price = 0.0

    for i in range(len(itinerary) - 1):
        start = itinerary[i]
        end = itinerary[i + 1]

        # Find the shortest path between the current stop and the next stop
        path, t_time, t_dist, t_price = find_optimal_route(start, end, criteria)

        if not path:
            print(f"  [MULTI-CITY] Failed to find route between {start} and {end}")
            return None, 0, 0, 0

        # Append the calculated segment to the full route.
        # If full_path already has nodes, we skip the first node of the new path
        # to prevent duplicating the intermediate airport.
        if full_path:
            full_path.extend(path[1:])
        else:
            full_path.extend(path)

        total_time += t_time
        total_distance += t_dist
        total_price += t_price

    elapsed = (time.time() - t_start) * 1000
    print(f"  [MULTI-CITY] Completed in {elapsed:.2f}ms")

    return full_path, total_time, round(total_distance, 2), round(total_price, 2)

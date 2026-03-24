import time
import heapq
from app.services.data_store import flight_graph


def find_optimal_route(start_iata, end_iata, criteria='time'):
    """Dijkstra's algorithm to find the optimal route between two airports."""
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
            return path, tot_time, tot_dist, tot_price

        if current in flight_graph:
            for neighbor, dur, dist, price in flight_graph[current]:
                if neighbor not in visited:
                    if criteria == 'time':
                        weight = dur
                    elif criteria == 'distance':
                        weight = dist
                    elif criteria == 'price':
                        weight = price
                    elif criteria == 'connections':
                        weight = 1
                    else:
                        weight = dur

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


def dijkstra_for_yens(start_iata, end_iata, ignored_nodes, ignored_edges, criteria='price'):
    """Modified Dijkstra for Yen's Algorithm that ignores specific nodes and edges."""
    queue = [(0, start_iata, [start_iata], 0, 0, 0)]
    visited = set()

    while queue:
        cost, current, path, tot_time, tot_dist, tot_price = heapq.heappop(queue)

        if current == end_iata:
            return path, tot_time, tot_dist, tot_price

        if current in visited:
            continue
        visited.add(current)

        if current in flight_graph:
            for neighbor, dur, dist, price in flight_graph[current]:
                if neighbor in ignored_nodes:
                    continue
                if (current, neighbor) in ignored_edges:
                    continue
                if neighbor in visited:
                    continue

                if criteria == 'time':
                    weight = dur
                elif criteria == 'distance':
                    weight = dist
                elif criteria == 'price':
                    weight = price
                else:
                    weight = price

                heapq.heappush(queue, (
                    cost + weight, neighbor, path + [neighbor],
                    tot_time + dur, tot_dist + dist, tot_price + price
                ))
    return None, 0, 0, 0

import time
from collections import deque
from app.services.data_store import flight_graph, airport_names


def find_reachable_airports_bfs(start, max_stops=2):
    """BFS to find all airports reachable within a given number of stops."""
    print(f"  [BFS] Starting BFS from '{start}' with max {max_stops} stops")
    t_start = time.time()

    reachable = {}
    visited = {start}
    nodes_dequeued = 0

    queue = deque()
    queue.append((start, 0))

    while queue:
        current, depth = queue.popleft()
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
    return reachable

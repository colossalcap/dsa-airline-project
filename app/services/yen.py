import time
from app.services.data_store import flight_graph
from app.services.dijkstra import dijkstra_for_yens


def find_alternative_routes_yens(start, end, max_connections=3, K=10):
    """Yen's Algorithm (K-Shortest Paths)."""
    print(f"  [YEN] Starting Yen's Algorithm: {start} -> {end} (Top {K} routes, max {max_connections} connections)")
    t_start = time.time()

    A = []
    B = []
    B_paths = set()

    path, tot_time, tot_dist, tot_price = dijkstra_for_yens(start, end, set(), set(), criteria='price')
    if not path:
        return []

    # Must append root path to A even if it exceeds max_connections,
    # to serve as a valid seed for spur branches
    A.append({
        "path": path,
        "total_time": tot_time,
        "total_distance": round(tot_dist, 2),
        "total_price": round(tot_price, 2)
    })

    for k in range(1, K):
        if k - 1 >= len(A):
            break

        for i in range(len(A[k - 1]["path"]) - 1):
            spur_node = A[k - 1]["path"][i]
            root_path = A[k - 1]["path"][:i + 1]

            ignored_edges = set()
            for p_dict in A:
                p = p_dict["path"]
                if len(p) > i and p[:i + 1] == root_path:
                    ignored_edges.add((p[i], p[i + 1]))

            ignored_nodes = set(root_path[:-1])

            spur_path, _, _, _ = dijkstra_for_yens(spur_node, end, ignored_nodes, ignored_edges, criteria='price')

            if spur_path:
                total_path = root_path[:-1] + spur_path

                if len(total_path) - 2 > max_connections:
                    continue

                t_time, t_dist, t_price = 0, 0.0, 0.0
                valid_path = True

                for j in range(len(total_path) - 1):
                    u = total_path[j]
                    v = total_path[j + 1]
                    edge_found = False
                    for neighbor, dur, dist, price in flight_graph.get(u, []):
                        if neighbor == v:
                            t_time += dur
                            t_dist += dist
                            t_price += price
                            edge_found = True
                            break
                    if not edge_found:
                        valid_path = False
                        break

                if valid_path:
                    path_tuple = tuple(total_path)
                    if path_tuple not in B_paths:
                        B.append({
                            "path": total_path,
                            "total_time": t_time,
                            "total_distance": round(t_dist, 2),
                            "total_price": round(t_price, 2),
                            "cost": t_price
                        })
                        B_paths.add(path_tuple)

        if not B:
            break

        B.sort(key=lambda x: x["cost"])
        best_new_path = B.pop(0)
        B_paths.remove(tuple(best_new_path["path"]))

        best_new_path_clean = {k: v for k, v in best_new_path.items() if k != 'cost'}
        A.append(best_new_path_clean)

    elapsed = (time.time() - t_start) * 1000
    print(f"  [YEN] Found {len(A)} alternative routes in {elapsed:.2f}ms")

    # Filter by max_connections and sort by price
    valid_routes = [r for r in A if (len(r["path"]) - 2) <= max_connections]
    valid_routes.sort(key=lambda r: r["total_price"])
    return valid_routes

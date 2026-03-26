"""
Yen's Algorithm service (K-Shortest Paths).
Provides alternative route finding by discovering the top K shortest paths
between a start and end airport, excluding specific nodes/edges gracefully.
"""
import time
from app.services.data_store import flight_graph
from app.services.dijkstra import dijkstra_for_yens, MinHeap

def find_alternative_routes_yens(start, end, max_connections=3, K=10):
    """Yen's Algorithm (K-Shortest Paths)."""
    print(f"  [YEN] Starting Yen's Algorithm: {start} -> {end} (Top {K} routes, max {max_connections} connections)")
    t_start = time.time()

    # A will store the accepted k shortest paths
    A = []
    
    # OPTIMIZATION 1: Use the custom MinHeap instead of a List
    B_heap = MinHeap()
    push_count_b = 0  # Tie-breaker to prevent dictionary comparisons in the heap
    
    # B_paths keeps track of paths already in B to prevent adding duplicates
    B_paths = set()

    # Determine the shortest path from the start to the end using Dijkstra's algorithm
    path, tot_time, tot_dist, tot_price = dijkstra_for_yens(start, end, set(), set(), criteria='price')
    if not path:
        return []

    # Keep the seed path regardless of max_connections!
    A.append({
        "path": path,
        "total_time": tot_time,
        "total_distance": round(tot_dist, 2),
        "total_price": round(tot_price, 2)
    })

    for k in range(1, K):
        if k - 1 >= len(A):
            break

        # OPTIMIZATION 2: Initialize a running tally for the root path costs
        root_time, root_dist, root_price = 0, 0.0, 0.0

        for i in range(len(A[k - 1]["path"]) - 1):
            # The node where the new path will branch off
            spur_node = A[k - 1]["path"][i]
            # The sequence of nodes from the start point to the spur node
            root_path = A[k - 1]["path"][:i + 1]

            ignored_edges = set()
            for p_dict in A:
                p = p_dict["path"]
                
                # OPTIMIZATION 3: Fast guard check (p[i] == spur_node) avoids expensive slicing
                if len(p) > i and p[i] == spur_node and p[:i + 1] == root_path:
                    ignored_edges.add((p[i], p[i + 1]))

            ignored_nodes = set(root_path[:-1])

            spur_path, s_time, s_dist, s_price = dijkstra_for_yens(
                spur_node, end, ignored_nodes, ignored_edges, criteria='price'
            )

            if spur_path:
                total_path = root_path[:-1] + spur_path

                # We can safely ignore spur paths that exceed connections right here
                if len(total_path) - 2 <= max_connections:
                    t_time = root_time + s_time
                    t_dist = root_dist + s_dist
                    t_price = root_price + s_price

                    path_tuple = tuple(total_path)
                    if path_tuple not in B_paths:
                        # Push into MinHeap: (cost, tie_breaker, path_dictionary)
                        B_heap.push((
                            t_price, 
                            push_count_b, 
                            {
                                "path": total_path,
                                "total_time": t_time,
                                "total_distance": round(t_dist, 2),
                                "total_price": round(t_price, 2)
                            }
                        ))
                        push_count_b += 1
                        B_paths.add(path_tuple)

            # UPDATE RUNNING TALLY: Add the edge we just branched from for the next 'i' iteration
            u = A[k - 1]["path"][i]
            v = A[k - 1]["path"][i + 1]
            if u in flight_graph:
                for neighbor, dur, dist, price in flight_graph[u]:
                    if neighbor == v:
                        root_time += dur
                        root_dist += dist
                        root_price += price
                        break

        if not B_heap:
            break

        # Extract the absolute best candidate from the heap in O(log N) time
        _, _, best_new_path = B_heap.pop()
        B_paths.remove(tuple(best_new_path["path"]))
        
        A.append(best_new_path)

    elapsed = (time.time() - t_start) * 1000
    print(f"  [YEN] Found {len(A)} alternative routes in {elapsed:.2f}ms")

    # Final filter: Strip out any seed paths (or others) that violate the max_connections rule
    valid_routes = [r for r in A if (len(r["path"]) - 2) <= max_connections]
    
    return valid_routes
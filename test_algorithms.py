"""
Comprehensive test suite for algorithms.py

Uses a small, deterministic mock flight graph so every expected
result can be verified by hand.

Mock Graph (5 airports):
    
    A ---(dur=120, dist=1000, price=200)---> B
    A ---(dur=300, dist=800,  price=150)---> C
    B ---(dur=60,  dist=500,  price=100)---> D
    B ---(dur=90,  dist=400,  price=80)----> C
    C ---(dur=100, dist=600,  price=120)---> D
    C ---(dur=200, dist=1200, price=250)---> E
    D ---(dur=150, dist=900,  price=180)---> E

Paths from A -> E:
    A->B->D->E  : time=330, dist=2400, price=480
    A->B->C->E  : time=510, dist=2200, price=530   (longer but via C detour)
    A->B->C->D->E: time=370, dist=2500, price=500  (4 nodes = 2 connections)
    A->C->D->E  : time=550, dist=2300, price=450
    A->C->E     : time=500, dist=2000, price=400   (cheapest & shortest dist)
    A->B->D->E  : time=330 (fastest)
"""

import pytest
from unittest.mock import patch

# ---------------------------------------------------------------------------
# Test graph data
# ---------------------------------------------------------------------------
MOCK_FLIGHT_GRAPH = {
    "A": [
        ("B", 120, 1000.0, 200.0),
        ("C", 300, 800.0,  150.0),
    ],
    "B": [
        ("D", 60,  500.0, 100.0),
        ("C", 90,  400.0,  80.0),
    ],
    "C": [
        ("D", 100, 600.0, 120.0),
        ("E", 200, 1200.0, 250.0),
    ],
    "D": [
        ("E", 150, 900.0, 180.0),
    ],
}

MOCK_AIRPORT_NAMES = {
    "A": "Alpha City (A) - Alpha International",
    "B": "Bravo City (B) - Bravo International",
    "C": "Charlie City (C) - Charlie International",
    "D": "Delta City (D) - Delta International",
    "E": "Echo City (E) - Echo International",
}

MOCK_COORDS_DICT = {
    "A": (1.0, 1.0),
    "B": (2.0, 2.0),
    "C": (3.0, 3.0),
    "D": (4.0, 4.0),
    "E": (5.0, 5.0),
}

# We patch the module-level globals that algorithms.py imports from data_store
PATCH_GRAPH  = "utils.algorithms.flight_graph"
PATCH_NAMES  = "utils.algorithms.airport_names"
PATCH_COORDS = "utils.algorithms.coords_dict"


@pytest.fixture(autouse=True)
def mock_data():
    """Automatically patches the global data store for every test."""
    with patch(PATCH_GRAPH, MOCK_FLIGHT_GRAPH), \
         patch(PATCH_NAMES, MOCK_AIRPORT_NAMES), \
         patch(PATCH_COORDS, MOCK_COORDS_DICT):
        yield


# ===========================================================================
# 1. QUICK SORT TESTS
# ===========================================================================
class TestQuickSort:
    """Tests for the quick_sort function."""

    def test_sort_integers_ascending(self):
        from utils.algorithms import quick_sort
        data = [{"v": 5}, {"v": 2}, {"v": 8}, {"v": 1}, {"v": 4}]
        result = quick_sort(data, key_func=lambda x: x["v"])
        assert [d["v"] for d in result] == [1, 2, 4, 5, 8]

    def test_sort_strings_alphabetical(self):
        from utils.algorithms import quick_sort
        data = [{"n": "delta"}, {"n": "alpha"}, {"n": "charlie"}, {"n": "bravo"}]
        result = quick_sort(data, key_func=lambda x: x["n"])
        assert [d["n"] for d in result] == ["alpha", "bravo", "charlie", "delta"]

    def test_sort_already_sorted(self):
        from utils.algorithms import quick_sort
        data = [{"v": 1}, {"v": 2}, {"v": 3}]
        result = quick_sort(data, key_func=lambda x: x["v"])
        assert [d["v"] for d in result] == [1, 2, 3]

    def test_sort_reverse_order(self):
        from utils.algorithms import quick_sort
        data = [{"v": 5}, {"v": 4}, {"v": 3}, {"v": 2}, {"v": 1}]
        result = quick_sort(data, key_func=lambda x: x["v"])
        assert [d["v"] for d in result] == [1, 2, 3, 4, 5]

    def test_sort_single_element(self):
        from utils.algorithms import quick_sort
        data = [{"v": 42}]
        result = quick_sort(data, key_func=lambda x: x["v"])
        assert [d["v"] for d in result] == [42]

    def test_sort_empty_list(self):
        from utils.algorithms import quick_sort
        result = quick_sort([], key_func=lambda x: x)
        assert result == []

    def test_sort_duplicates(self):
        from utils.algorithms import quick_sort
        data = [{"v": 3}, {"v": 1}, {"v": 3}, {"v": 2}, {"v": 1}]
        result = quick_sort(data, key_func=lambda x: x["v"])
        assert [d["v"] for d in result] == [1, 1, 2, 3, 3]

    def test_sort_is_in_place(self):
        """Quick sort should modify the original list (in-place)."""
        from utils.algorithms import quick_sort
        data = [{"v": 3}, {"v": 1}, {"v": 2}]
        result = quick_sort(data, key_func=lambda x: x["v"])
        assert result is data  # same object reference


# ===========================================================================
# 2. DIJKSTRA / OPTIMAL ROUTE TESTS
# ===========================================================================
class TestFindOptimalRoute:
    """Tests for find_optimal_route (Dijkstra's algorithm)."""

    def test_optimal_by_time(self):
        """Fastest route A->E should be A->B->D->E (time=330)."""
        from utils.algorithms import find_optimal_route
        path, tot_time, tot_dist, tot_price = find_optimal_route("A", "E", "time")
        assert path == ["A", "B", "D", "E"]
        assert tot_time == 330

    def test_optimal_by_distance(self):
        """Shortest distance A->E should be A->C->E (dist=2000)."""
        from utils.algorithms import find_optimal_route
        path, tot_time, tot_dist, tot_price = find_optimal_route("A", "E", "distance")
        assert path == ["A", "C", "E"]
        assert tot_dist == 2000.0

    def test_optimal_by_price(self):
        """Cheapest route A->E should be A->C->E (price=400)."""
        from utils.algorithms import find_optimal_route
        path, tot_time, tot_dist, tot_price = find_optimal_route("A", "E", "price")
        assert path == ["A", "C", "E"]
        assert tot_price == 400.0

    def test_optimal_by_connections(self):
        """Fewest connections A->E. A->C->E has 1 connection (weight=2 hops),
        which is fewer than A->B->D->E with 2 connections (weight=3 hops)."""
        from utils.algorithms import find_optimal_route
        path, tot_time, tot_dist, tot_price = find_optimal_route("A", "E", "connections")
        assert len(path) == 3  # A, C, E => fewest stops

    def test_direct_neighbor(self):
        """Direct flight A->B should return a 2-node path."""
        from utils.algorithms import find_optimal_route
        path, tot_time, tot_dist, tot_price = find_optimal_route("A", "B", "time")
        assert path == ["A", "B"]
        assert tot_time == 120

    def test_no_route_exists(self):
        """No route from E to A (graph is directed, E has no outgoing edges)."""
        from utils.algorithms import find_optimal_route
        path, tot_time, tot_dist, tot_price = find_optimal_route("E", "A", "time")
        assert path is None

    def test_same_source_and_dest(self):
        """A->A should find no path since a node is marked visited immediately."""
        from utils.algorithms import find_optimal_route
        path, tot_time, tot_dist, tot_price = find_optimal_route("A", "A", "time")
        # The algorithm starts with A in the path, pops A, finds A == end, returns immediately
        assert path == ["A"]

    def test_invalid_start_airport(self):
        """Starting from a node not in the graph should return None."""
        from utils.algorithms import find_optimal_route
        path, tot_time, tot_dist, tot_price = find_optimal_route("Z", "E", "time")
        assert path is None


# ===========================================================================
# 3. DIJKSTRA FOR YEN'S (modified Dijkstra) TESTS
# ===========================================================================
class TestDijkstraForYens:
    """Tests for dijkstra_for_yens with ignored nodes/edges."""

    def test_basic_shortest_path(self):
        """Without ignoring anything, should find cheapest path A->E = A->C->E."""
        from utils.algorithms import dijkstra_for_yens
        path, t, d, p = dijkstra_for_yens("A", "E", set(), set(), "price")
        assert path == ["A", "C", "E"]

    def test_ignore_node(self):
        """Ignoring C should force the route through B->D->E."""
        from utils.algorithms import dijkstra_for_yens
        path, t, d, p = dijkstra_for_yens("A", "E", ignored_nodes={"C"}, ignored_edges=set(), criteria="price")
        assert path is not None
        assert "C" not in path
        assert path == ["A", "B", "D", "E"]

    def test_ignore_edge(self):
        """Ignoring edge A->C should force a path through B."""
        from utils.algorithms import dijkstra_for_yens
        path, t, d, p = dijkstra_for_yens("A", "E", ignored_nodes=set(), ignored_edges={("A", "C")}, criteria="price")
        assert path is not None
        assert path[0] == "A"
        assert path[1] == "B"  # must go through B since A->C is blocked

    def test_no_path_due_to_ignored(self):
        """Ignoring enough nodes/edges to make the path impossible."""
        from utils.algorithms import dijkstra_for_yens
        # Block both B and C — no way to leave A toward E
        path, t, d, p = dijkstra_for_yens("A", "E", ignored_nodes={"B", "C"}, ignored_edges=set(), criteria="price")
        assert path is None


# ===========================================================================
# 4. YEN'S K-SHORTEST PATHS TESTS
# ===========================================================================
class TestFindAlternativeRoutesYens:
    """Tests for find_alternative_routes_yens (Yen's algorithm)."""

    def test_returns_routes(self):
        """Should find at least 1 route from A to E."""
        from utils.algorithms import find_alternative_routes_yens
        routes = find_alternative_routes_yens("A", "E", max_connections=3, K=10)
        assert len(routes) >= 1

    def test_routes_sorted_by_price(self):
        """Returned routes should be sorted by price ascending."""
        from utils.algorithms import find_alternative_routes_yens
        routes = find_alternative_routes_yens("A", "E", max_connections=3, K=10)
        prices = [r["total_price"] for r in routes]
        assert prices == sorted(prices)

    def test_cheapest_route_first(self):
        """The cheapest route A->E is A->C->E at price 400."""
        from utils.algorithms import find_alternative_routes_yens
        routes = find_alternative_routes_yens("A", "E", max_connections=3, K=10)
        assert routes[0]["path"] == ["A", "C", "E"]
        assert routes[0]["total_price"] == 400.0

    def test_respects_max_connections(self):
        """All returned routes should have at most max_connections stops."""
        from utils.algorithms import find_alternative_routes_yens
        max_conn = 2
        routes = find_alternative_routes_yens("A", "E", max_connections=max_conn, K=10)
        for r in routes:
            connections = len(r["path"]) - 2  # intermediate stops
            assert connections <= max_conn, \
                f"Route {r['path']} has {connections} connections, max is {max_conn}"

    def test_all_paths_unique(self):
        """No duplicate paths should be returned."""
        from utils.algorithms import find_alternative_routes_yens
        routes = find_alternative_routes_yens("A", "E", max_connections=3, K=10)
        path_tuples = [tuple(r["path"]) for r in routes]
        assert len(path_tuples) == len(set(path_tuples))

    def test_route_dict_keys(self):
        """Each route dict should have the expected keys."""
        from utils.algorithms import find_alternative_routes_yens
        routes = find_alternative_routes_yens("A", "E", max_connections=3, K=10)
        expected_keys = {"path", "total_time", "total_distance", "total_price"}
        for r in routes:
            assert expected_keys.issubset(r.keys()), f"Missing keys in route: {r.keys()}"

    def test_no_route(self):
        """Should return empty list if no route exists (E->A)."""
        from utils.algorithms import find_alternative_routes_yens
        routes = find_alternative_routes_yens("E", "A", max_connections=3, K=10)
        assert routes == []

    def test_max_connections_1(self):
        """With max_connections=1, only direct or 1-stop routes should appear."""
        from utils.algorithms import find_alternative_routes_yens
        routes = find_alternative_routes_yens("A", "E", max_connections=1, K=10)
        for r in routes:
            # path length 2 = direct, path length 3 = 1 connection
            assert len(r["path"]) <= 3, f"Route {r['path']} exceeds 1 connection"


# ===========================================================================
# 5. BFS REACHABILITY TESTS
# ===========================================================================
class TestFindReachableAirportsBfs:
    """Tests for find_reachable_airports_bfs."""

    def test_reachable_with_0_stops(self):
        """With max_stops=0, should return nothing (can't move)."""
        from utils.algorithms import find_reachable_airports_bfs
        reachable = find_reachable_airports_bfs("A", max_stops=0)
        assert reachable == {}

    def test_reachable_with_1_stop(self):
        """With 1 stop from A, should reach B and C (direct neighbors)."""
        from utils.algorithms import find_reachable_airports_bfs
        reachable = find_reachable_airports_bfs("A", max_stops=1)
        assert 1 in reachable
        iatas = {ap["iata"] for ap in reachable[1]}
        assert iatas == {"B", "C"}

    def test_reachable_with_2_stops(self):
        """With 2 stops from A: level 1 = {B, C}, level 2 = {D, E}."""
        from utils.algorithms import find_reachable_airports_bfs
        reachable = find_reachable_airports_bfs("A", max_stops=2)

        level_1_iatas = {ap["iata"] for ap in reachable.get(1, [])}
        level_2_iatas = {ap["iata"] for ap in reachable.get(2, [])}
        
        assert level_1_iatas == {"B", "C"}
        assert level_2_iatas == {"D", "E"}

    def test_reachable_includes_names(self):
        """Each result entry should have 'iata' and 'name' keys."""
        from utils.algorithms import find_reachable_airports_bfs
        reachable = find_reachable_airports_bfs("A", max_stops=1)
        for level, airports in reachable.items():
            for ap in airports:
                assert "iata" in ap
                assert "name" in ap

    def test_start_not_in_reachable(self):
        """The start airport should NOT appear in the reachable results."""
        from utils.algorithms import find_reachable_airports_bfs
        reachable = find_reachable_airports_bfs("A", max_stops=3)
        all_iatas = {ap["iata"] for airports in reachable.values() for ap in airports}
        assert "A" not in all_iatas

    def test_no_outgoing_edges(self):
        """Node E has no outgoing edges; should return empty."""
        from utils.algorithms import find_reachable_airports_bfs
        reachable = find_reachable_airports_bfs("E", max_stops=2)
        assert reachable == {}

    def test_no_duplicates_across_levels(self):
        """An airport should appear in only one level (BFS guarantees shortest)."""
        from utils.algorithms import find_reachable_airports_bfs
        reachable = find_reachable_airports_bfs("A", max_stops=3)
        seen = set()
        for level, airports in reachable.items():
            for ap in airports:
                assert ap["iata"] not in seen, f"{ap['iata']} appears in multiple levels"
                seen.add(ap["iata"])


# ===========================================================================
# 6. MULTI-CITY ROUTE TESTS
# ===========================================================================
class TestPlanMultiCityRoute:
    """Tests for plan_multi_city_route (chained Dijkstra)."""

    def test_two_city_same_as_optimal(self):
        """A 2-city itinerary should produce the same result as a single Dijkstra call."""
        from utils.algorithms import plan_multi_city_route, find_optimal_route
        mc_path, mc_t, mc_d, mc_p = plan_multi_city_route(["A", "E"], criteria="price")
        opt_path, opt_t, opt_d, opt_p = find_optimal_route("A", "E", "price")
        assert mc_path == opt_path

    def test_three_city_itinerary(self):
        """A->B->E: should chain A->B and B->E legs correctly."""
        from utils.algorithms import plan_multi_city_route
        path, tot_time, tot_dist, tot_price = plan_multi_city_route(["A", "B", "E"], criteria="time")
        assert path is not None
        assert path[0] == "A"
        assert "B" in path
        assert path[-1] == "E"

    def test_multi_city_total_matches_legs(self):
        """Verify the totals are the sum of each individual leg."""
        from utils.algorithms import plan_multi_city_route, find_optimal_route
        
        # Leg 1: A -> B
        p1, t1, d1, pr1 = find_optimal_route("A", "B", "price")
        # Leg 2: B -> D
        p2, t2, d2, pr2 = find_optimal_route("B", "D", "price")
        
        # Multi-city A -> B -> D
        mc_path, mc_t, mc_d, mc_p = plan_multi_city_route(["A", "B", "D"], criteria="price")
        
        assert mc_t == t1 + t2
        assert mc_p == round(pr1 + pr2, 2)

    def test_multi_city_path_continuity(self):
        """The path should be continuous: each leg connects to the next."""
        from utils.algorithms import plan_multi_city_route
        path, _, _, _ = plan_multi_city_route(["A", "C", "E"], criteria="price")
        assert path is not None
        # Check path goes through C and E
        c_idx = path.index("C")
        assert c_idx > 0
        assert path[-1] == "E"

    def test_multi_city_unreachable_leg(self):
        """If any leg is unreachable, should return None."""
        from utils.algorithms import plan_multi_city_route
        # E has no outgoing edges, so E->A is impossible
        path, t, d, p = plan_multi_city_route(["A", "E", "A"], criteria="price")
        assert path is None

    def test_multi_city_no_duplicate_join_node(self):
        """When stitching legs, the joining airport should not be duplicated."""
        from utils.algorithms import plan_multi_city_route
        path, _, _, _ = plan_multi_city_route(["A", "B", "D"], criteria="price")
        assert path is not None
        # B should appear exactly once at the join
        assert path.count("B") == 1

"""
============================================================================
                    BFS Performance Benchmark Suite
         Compares Optimized BFS (BlockQueue) vs Naive BFS (Python list)
============================================================================

This script benchmarks two BFS implementations side-by-side:

  1. NAIVE BFS   - Uses a plain Python `list` as a queue with `list.pop(0)`.
                   `pop(0)` is O(n) because every remaining element must be
                   shifted left after the removal. Visited nodes are checked
                   AFTER dequeuing (late check), which allows duplicate nodes
                   to accumulate in the queue. No early-exit pruning.

  2. OPTIMIZED BFS - Uses the BlockQueue (Unrolled Linked List) from the
                     project. Achieves O(1) amortized enqueue/dequeue,
                     applies early-exit pruning, marks nodes as visited
                     BEFORE enqueuing (pre-check) to prevent duplicates,
                     and uses __slots__ + reference nulling for memory
                     efficiency.

The benchmark has two sections:

  Section A: Real-World Flight Graph
      Tests both implementations against the actual airline route dataset
      with varying starting airports and stop counts.

  Section B: Synthetic Scaling Test
      Generates progressively larger random graphs to isolate and magnify
      the O(n) vs O(1) dequeue performance difference at scale.

Metrics captured per run:
  - Wall-clock time  (seconds)
  - Peak memory usage (MB)
  - Total nodes dequeued

Usage:
    python scripts/benchmark_bfs.py

Output:
    - Formatted table printed to the terminal
    - Bar charts saved to  scripts/benchmark_results/
"""

import sys
import os
import time
import tracemalloc
import random

# -----------------------------------------------------------------------
# Path setup - allow imports from the project root
# -----------------------------------------------------------------------
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from app.services.data_store import load_flight_data, flight_graph, airport_names
from app.services.bfs import BlockQueue


# ======================================================================
#  1.  NAIVE BFS IMPLEMENTATION  (the "before" version)
# ======================================================================

def naive_bfs(graph, start, max_stops=2):
    """
    A deliberately un-optimized BFS using a plain Python list as a FIFO queue.

    Key inefficiencies vs the optimized version:

      1. list.pop(0) is O(n) - shifting every remaining element left.

      2. LATE visited check - nodes are marked as visited only WHEN DEQUEUED,
         not when enqueued. This means multiple paths can enqueue the SAME
         node before it is first dequeued and marked. The queue fills with
         duplicates, wasting both memory and processing time.

      3. No early-exit pruning - even though BFS processes nodes in
         non-decreasing depth order, this version uses `continue` to skip
         nodes past the limit instead of `break`. Every over-depth node
         that was already queued must still be popped and checked.
    """
    reachable = {}
    visited = set()            # <-- NOT pre-seeded with start
    nodes_dequeued = 0

    # Plain Python list used as a queue (FIFO via pop(0))
    queue = [(start, 0)]

    while len(queue) > 0:
        # O(n) removal from the front - every element behind index 0
        # must be copied one position to the left.
        current, depth = queue.pop(0)
        nodes_dequeued += 1

        # LATE VISITED CHECK: duplicates already in the queue are dequeued
        # and processed here; only skipped if already visited.
        if current in visited:
            continue
        visited.add(current)

        # No early-exit: uses `continue` instead of `break`, so every
        # remaining node past the limit must still be popped and checked.
        if depth > max_stops:
            continue

        if current in graph:
            for neighbor_data in graph[current]:
                neighbor = neighbor_data[0] if isinstance(neighbor_data, tuple) else neighbor_data
                # Enqueue ALL neighbors - even if they are already visited
                # or already in the queue. The visited check only happens
                # on dequeue, so duplicates pile up.
                next_depth = depth + 1
                queue.append((neighbor, next_depth))

                # Still record reachable airports for correctness comparison
                if neighbor not in visited and next_depth <= max_stops:
                    if next_depth not in reachable:
                        reachable[next_depth] = []
                    reachable[next_depth].append(neighbor)

    return reachable, nodes_dequeued


# ======================================================================
#  2.  OPTIMIZED BFS  (uses BlockQueue from the project)
# ======================================================================

def optimized_bfs(graph, start, max_stops=2):
    """
    The project's optimized BFS using BlockQueue (Unrolled Linked List).

    Key optimizations over naive:

      1. BlockQueue gives O(1) enqueue/dequeue - no element shifting.

      2. PRE-ENQUEUE visited check - nodes are marked visited BEFORE being
         added to the queue. No duplicate nodes ever enter the queue.

      3. Early-exit pruning - because BFS processes nodes in non-decreasing
         depth order, once we see depth > max_stops every subsequent node
         will also be past the limit. We `break` immediately.

      4. __slots__ on block nodes reduces per-object memory overhead.

      5. Reference nulling on dequeue prevents memory leaks in long runs.
    """
    reachable = {}
    visited = {start}          # <-- Pre-seeded: start is marked before enqueuing
    nodes_dequeued = 0

    queue = BlockQueue()
    queue.enqueue((start, 0))

    while queue:
        current, depth = queue.dequeue()
        nodes_dequeued += 1

        # EARLY EXIT - break instead of continue.  Since BFS processes
        # nodes in non-decreasing depth order, once we see depth >
        # max_stops every subsequent node is also past the limit.
        if depth > max_stops:
            break

        if current in graph:
            for neighbor_data in graph[current]:
                neighbor = neighbor_data[0] if isinstance(neighbor_data, tuple) else neighbor_data
                # PRE-ENQUEUE check: only enqueue if not already visited
                if neighbor not in visited:
                    visited.add(neighbor)
                    next_depth = depth + 1
                    if next_depth <= max_stops:
                        if next_depth not in reachable:
                            reachable[next_depth] = []
                        reachable[next_depth].append(neighbor)
                        queue.enqueue((neighbor, next_depth))

    return reachable, nodes_dequeued


# ======================================================================
#  3.  SYNTHETIC GRAPH GENERATOR
# ======================================================================

def _generate_synthetic_graph(num_nodes, avg_edges_per_node=15):
    """
    Generate a random directed graph as an adjacency list.
    Each node is a string like 'N0', 'N1', etc.
    Each edge is a tuple (destination, weight) for compatibility.
    """
    nodes = [f"N{i}" for i in range(num_nodes)]
    graph = {}
    for node in nodes:
        num_edges = random.randint(max(1, avg_edges_per_node // 2), avg_edges_per_node * 2)
        neighbors = random.sample(nodes, min(num_edges, num_nodes - 1))
        graph[node] = [(n, random.randint(60, 600)) for n in neighbors if n != node]
    return graph, nodes[0]


# ======================================================================
#  4.  BENCHMARK HARNESS
# ======================================================================

def _run_single(bfs_func, graph, start, max_stops, warmup_runs=1, timed_runs=5):
    """
    Run a single BFS function multiple times and return averaged metrics.
    """
    # Warmup
    for _ in range(warmup_runs):
        bfs_func(graph, start, max_stops)

    times = []
    peak_mem = 0
    nodes = 0
    result_count = 0

    for _ in range(timed_runs):
        tracemalloc.start()

        t0 = time.perf_counter()
        reachable, nodes_dequeued = bfs_func(graph, start, max_stops)
        t1 = time.perf_counter()

        _, mem_peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        times.append(t1 - t0)
        peak_mem = max(peak_mem, mem_peak)
        nodes = nodes_dequeued
        result_count = sum(len(v) for v in reachable.values())

    return {
        "avg_time": sum(times) / len(times),
        "peak_memory_mb": peak_mem / (1024 * 1024),
        "nodes_dequeued": nodes,
        "result_count": result_count,
    }


# ======================================================================
#  5.  CHART GENERATION
# ======================================================================

def _generate_charts(section_a_results, section_b_results, output_dir):
    """Generate bar charts for both benchmark sections."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("\n  [!] matplotlib not installed - skipping chart generation.")
        print("      Install with:  pip install matplotlib\n")
        return

    os.makedirs(output_dir, exist_ok=True)

    CLR_NAIVE = "#e74c3c"
    CLR_OPTIM = "#2ecc71"
    bar_width = 0.35

    # ---- Chart 1: Section A - Execution Time ----
    if section_a_results:
        labels = [f"{r['start']} (s={r['max_stops']})" for r in section_a_results]
        naive_times = [r["naive"]["avg_time"] * 1000 for r in section_a_results]
        optim_times = [r["optimized"]["avg_time"] * 1000 for r in section_a_results]
        speedups = [r["speedup"] for r in section_a_results]
        x = list(range(len(labels)))

        fig, ax = plt.subplots(figsize=(max(12, len(labels) * 1.8), 6))
        bars1 = ax.bar([i - bar_width/2 for i in x], naive_times, bar_width,
                       label="Naive BFS (list + late check)", color=CLR_NAIVE, edgecolor="white")
        bars2 = ax.bar([i + bar_width/2 for i in x], optim_times, bar_width,
                       label="Optimized BFS (BlockQueue)", color=CLR_OPTIM, edgecolor="white")

        for bar, spd in zip(bars2, speedups):
            ax.annotate(f"{spd:.1f}x",
                        xy=(bar.get_x() + bar.get_width()/2, bar.get_height()),
                        xytext=(0, 6), textcoords="offset points",
                        ha="center", fontsize=8, fontweight="bold", color="#27ae60")

        ax.set_ylabel("Time (ms)", fontsize=12, fontweight="bold")
        ax.set_title("Section A: Flight Graph - Execution Time", fontsize=14, fontweight="bold", pad=15)
        ax.set_xticks(x)
        ax.set_xticklabels(labels, rotation=35, ha="right", fontsize=9)
        ax.legend(fontsize=10)
        ax.grid(axis="y", linestyle="--", alpha=0.4)
        fig.tight_layout()
        fig.savefig(os.path.join(output_dir, "section_a_time.png"), dpi=150)
        plt.close(fig)
        print(f"  [+] Saved  section_a_time.png")

    # ---- Chart 2: Section A - Nodes Dequeued ----
    if section_a_results:
        naive_nodes = [r["naive"]["nodes_dequeued"] for r in section_a_results]
        optim_nodes = [r["optimized"]["nodes_dequeued"] for r in section_a_results]

        fig, ax = plt.subplots(figsize=(max(12, len(labels) * 1.8), 6))
        ax.bar([i - bar_width/2 for i in x], naive_nodes, bar_width,
               label="Naive BFS (duplicate nodes)", color=CLR_NAIVE, edgecolor="white")
        ax.bar([i + bar_width/2 for i in x], optim_nodes, bar_width,
               label="Optimized BFS (no duplicates)", color=CLR_OPTIM, edgecolor="white")

        ax.set_ylabel("Nodes Dequeued", fontsize=12, fontweight="bold")
        ax.set_title("Section A: Nodes Processed (Duplicates vs No Duplicates)", fontsize=14, fontweight="bold", pad=15)
        ax.set_xticks(x)
        ax.set_xticklabels(labels, rotation=35, ha="right", fontsize=9)
        ax.legend(fontsize=10)
        ax.grid(axis="y", linestyle="--", alpha=0.4)
        fig.tight_layout()
        fig.savefig(os.path.join(output_dir, "section_a_nodes.png"), dpi=150)
        plt.close(fig)
        print(f"  [+] Saved  section_a_nodes.png")

    # ---- Chart 3: Section A - Memory Usage ----
    if section_a_results:
        naive_mem = [r["naive"]["peak_memory_mb"] for r in section_a_results]
        optim_mem = [r["optimized"]["peak_memory_mb"] for r in section_a_results]

        fig, ax = plt.subplots(figsize=(max(12, len(labels) * 1.8), 6))
        ax.bar([i - bar_width/2 for i in x], naive_mem, bar_width,
               label="Naive BFS", color=CLR_NAIVE, edgecolor="white")
        ax.bar([i + bar_width/2 for i in x], optim_mem, bar_width,
               label="Optimized BFS", color=CLR_OPTIM, edgecolor="white")

        ax.set_ylabel("Peak Memory (MB)", fontsize=12, fontweight="bold")
        ax.set_title("Section A: Peak Memory Usage", fontsize=14, fontweight="bold", pad=15)
        ax.set_xticks(x)
        ax.set_xticklabels(labels, rotation=35, ha="right", fontsize=9)
        ax.legend(fontsize=10)
        ax.grid(axis="y", linestyle="--", alpha=0.4)
        fig.tight_layout()
        fig.savefig(os.path.join(output_dir, "section_a_memory.png"), dpi=150)
        plt.close(fig)
        print(f"  [+] Saved  section_a_memory.png")

    # ---- Chart 4: Section B - Scaling ----
    if section_b_results:
        labels_b = [r["label"] for r in section_b_results]
        naive_times_b = [r["naive"]["avg_time"] * 1000 for r in section_b_results]
        optim_times_b = [r["optimized"]["avg_time"] * 1000 for r in section_b_results]
        speedups_b = [r["speedup"] for r in section_b_results]
        x_b = list(range(len(labels_b)))

        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

        # Left: execution time
        ax1.bar([i - bar_width/2 for i in x_b], naive_times_b, bar_width,
                label="Naive BFS", color=CLR_NAIVE, edgecolor="white")
        bars_b = ax1.bar([i + bar_width/2 for i in x_b], optim_times_b, bar_width,
                         label="Optimized BFS", color=CLR_OPTIM, edgecolor="white")
        for bar, spd in zip(bars_b, speedups_b):
            ax1.annotate(f"{spd:.1f}x",
                         xy=(bar.get_x() + bar.get_width()/2, bar.get_height()),
                         xytext=(0, 6), textcoords="offset points",
                         ha="center", fontsize=9, fontweight="bold", color="#27ae60")

        ax1.set_ylabel("Time (ms)", fontsize=11, fontweight="bold")
        ax1.set_title("Execution Time at Scale", fontsize=13, fontweight="bold")
        ax1.set_xticks(x_b)
        ax1.set_xticklabels(labels_b, rotation=30, ha="right", fontsize=9)
        ax1.legend(fontsize=9)
        ax1.grid(axis="y", linestyle="--", alpha=0.4)

        # Right: speedup factor
        bars_s = ax2.bar(x_b, speedups_b, color=CLR_OPTIM, edgecolor="white")
        ax2.axhline(y=1.0, color="gray", linestyle="--", linewidth=1, label="Baseline (1x)")
        for bar, spd in zip(bars_s, speedups_b):
            ax2.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.05,
                     f"{spd:.2f}x", ha="center", fontsize=10, fontweight="bold")

        ax2.set_ylabel("Speedup Factor", fontsize=11, fontweight="bold")
        ax2.set_title("Speedup vs Graph Size", fontsize=13, fontweight="bold")
        ax2.set_xticks(x_b)
        ax2.set_xticklabels(labels_b, rotation=30, ha="right", fontsize=9)
        ax2.legend(fontsize=9)
        ax2.grid(axis="y", linestyle="--", alpha=0.4)

        fig.suptitle("Section B: Synthetic Graph Scaling Test", fontsize=15, fontweight="bold", y=1.02)
        fig.tight_layout()
        fig.savefig(os.path.join(output_dir, "section_b_scaling.png"), dpi=150, bbox_inches="tight")
        plt.close(fig)
        print(f"  [+] Saved  section_b_scaling.png")


# ======================================================================
#  6.  PRETTY-PRINT HELPERS
# ======================================================================

BOLD  = "\033[1m"
DIM   = "\033[2m"
BLUE  = "\033[94m"
CYAN  = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED   = "\033[91m"
RESET = "\033[0m"


def _print_banner():
    print(f"""
{BOLD}{CYAN}============================================================================
               BFS PERFORMANCE BENCHMARK SUITE
       Naive (list + late check) vs Optimized (BlockQueue) BFS
============================================================================{RESET}
""")


def _print_section(title):
    width = 68
    print(f"\n{BOLD}{BLUE}+{'-' * width}+{RESET}")
    print(f"{BOLD}{BLUE}|{RESET}  {BOLD}{title:<{width - 2}}{RESET}{BOLD}{BLUE}|{RESET}")
    print(f"{BOLD}{BLUE}+{'-' * width}+{RESET}")


def _print_result_table(all_results, section_name=""):
    """Print a detailed comparison table."""
    _print_section(f"{section_name} - DETAILED RESULTS")

    hdr = (f"  {'Test Case':<30}| {'Naive(ms)':>10} | {'Optim(ms)':>10} "
           f"| {'Speedup':>8} | {'NaiveNodes':>10} | {'OptimNodes':>10} | {'Naive Mem':>9} | {'Optim Mem':>9}")
    sep = f"  {'-' * 30}+{'-' * 12}+{'-' * 12}+{'-' * 10}+{'-' * 12}+{'-' * 12}+{'-' * 11}+{'-' * 10}"

    print(f"\n{DIM}{hdr}{RESET}")
    print(f"{DIM}{sep}{RESET}")

    for r in all_results:
        label = r.get("label", f"{r.get('start', '?')} (stops={r.get('max_stops', '?')})")
        nt  = r["naive"]["avg_time"] * 1000
        ot  = r["optimized"]["avg_time"] * 1000
        spd = r["speedup"]
        nn  = r["naive"]["nodes_dequeued"]
        on  = r["optimized"]["nodes_dequeued"]
        nm  = r["naive"]["peak_memory_mb"]
        om  = r["optimized"]["peak_memory_mb"]

        spd_color = GREEN if spd >= 1.5 else YELLOW if spd >= 1.0 else RED
        print(
            f"  {label:<30}| {nt:>8.2f}ms | {ot:>8.2f}ms "
            f"| {spd_color}{BOLD}{spd:>6.2f}x{RESET} | {nn:>10,} | {on:>10,} | {nm:>7.2f}MB | {om:>7.2f}MB"
        )

    print()


def _print_summary(all_results):
    """Print overall summary."""
    _print_section("OVERALL SUMMARY")

    speedups = [r["speedup"] for r in all_results]
    avg_speedup = sum(speedups) / len(speedups)
    max_speedup = max(speedups)
    min_speedup = min(speedups)
    best_case   = next(r for r in all_results if r["speedup"] == max_speedup)

    best_label = best_case.get("label", f"{best_case.get('start', '?')}, stops={best_case.get('max_stops', '?')}")

    print(f"""
  {BOLD}Average Speedup:{RESET}  {GREEN}{BOLD}{avg_speedup:.2f}x{RESET}  faster
  {BOLD}Best Speedup:{RESET}     {GREEN}{BOLD}{max_speedup:.2f}x{RESET}  faster  ({best_label})
  {BOLD}Worst Speedup:{RESET}    {YELLOW}{BOLD}{min_speedup:.2f}x{RESET}  faster
""")

    _print_section("OPTIMIZATION TECHNIQUES USED")
    print(f"""
  {BOLD}1. BlockQueue (Unrolled Linked List){RESET}
     {DIM}Replaces list.pop(0) [O(n)] with O(1) amortized dequeue.
     Data is stored in fixed-size blocks for CPU cache locality.{RESET}

  {BOLD}2. __slots__ on _BlockNode{RESET}
     {DIM}Eliminates per-instance __dict__, reducing memory by ~40-60 bytes
     per block node object.{RESET}

  {BOLD}3. Early-Exit Pruning{RESET}
     {DIM}BFS explores level-by-level. Once a node exceeds max_stops,
     ALL remaining nodes will too -> break immediately (vs. continue).{RESET}

  {BOLD}4. Pre-Enqueue Visited Marking{RESET}
     {DIM}Nodes are marked visited BEFORE being added to the queue,
     preventing duplicate entries and wasted processing.{RESET}

  {BOLD}5. Reference Nulling on Dequeue{RESET}
     {DIM}Cleared references allow Python's GC to reclaim memory sooner,
     preventing leaks during long traversals.{RESET}
""")


# ======================================================================
#  7.  MAIN
# ======================================================================

def main():
    _print_banner()

    # ---- Load real flight data ----
    print(f"  {DIM}Loading flight graph ...{RESET}")
    load_flight_data()
    total_airports = len(flight_graph)
    total_edges = sum(len(v) for v in flight_graph.values())
    print(f"  {GREEN}+{RESET} Graph loaded: {BOLD}{total_airports:,}{RESET} airports, {BOLD}{total_edges:,}{RESET} edges\n")

    # ==================================================================
    # SECTION A: Real flight graph
    # ==================================================================
    _print_section("SECTION A: REAL FLIGHT GRAPH BENCHMARK")

    candidate_starts = ["JFK", "LHR", "DXB", "SIN", "LAX", "ATL", "CDG", "HND", "SFO", "ORD"]
    available_starts = [s for s in candidate_starts if s in flight_graph]
    if not available_starts:
        sorted_airports = sorted(flight_graph.keys(), key=lambda k: len(flight_graph[k]), reverse=True)
        available_starts = sorted_airports[:5]

    test_cases_a = []
    for start in available_starts[:5]:
        for stops in [1, 2, 3]:
            test_cases_a.append((start, stops))

    section_a_results = []
    total = len(test_cases_a)

    for idx, (start, stops) in enumerate(test_cases_a, 1):
        label = f"{start} (stops={stops})"
        print(f"  [{idx:>2}/{total}]  {BOLD}{label}{RESET} ... ", end="", flush=True)

        naive_m    = _run_single(naive_bfs,     flight_graph, start, stops)
        optimized_m = _run_single(optimized_bfs, flight_graph, start, stops)

        speedup = naive_m["avg_time"] / optimized_m["avg_time"] if optimized_m["avg_time"] > 0 else float("inf")

        result = {
            "start": start,
            "max_stops": stops,
            "label": label,
            "naive": naive_m,
            "optimized": optimized_m,
            "speedup": speedup,
        }
        section_a_results.append(result)

        color = GREEN if speedup >= 1.5 else YELLOW if speedup >= 1.0 else RED
        nn = naive_m["nodes_dequeued"]
        on = optimized_m["nodes_dequeued"]
        print(f"{color}{BOLD}{speedup:.2f}x{RESET}  (naive dequeued {nn:,} vs optimized {on:,} nodes)")

    _print_result_table(section_a_results, "SECTION A")

    # ==================================================================
    # SECTION B: Synthetic scaling test
    # ==================================================================
    _print_section("SECTION B: SYNTHETIC GRAPH SCALING TEST")
    print(f"  {DIM}Generating random graphs of increasing size ...{RESET}\n")

    scaling_configs = [
        (500,   10, 3),
        (1000,  12, 3),
        (2000,  15, 3),
        (5000,  15, 3),
        (10000, 15, 3),
    ]

    section_b_results = []
    random.seed(42)  # Reproducible results

    for i, (num_nodes, avg_edges, max_stops) in enumerate(scaling_configs, 1):
        label = f"{num_nodes:,} nodes"
        print(f"  [{i}/{len(scaling_configs)}]  {BOLD}{label}{RESET} (avg {avg_edges} edges, {max_stops} stops) ... ", end="", flush=True)

        syn_graph, syn_start = _generate_synthetic_graph(num_nodes, avg_edges)

        naive_m    = _run_single(naive_bfs,     syn_graph, syn_start, max_stops, warmup_runs=1, timed_runs=3)
        optimized_m = _run_single(optimized_bfs, syn_graph, syn_start, max_stops, warmup_runs=1, timed_runs=3)

        speedup = naive_m["avg_time"] / optimized_m["avg_time"] if optimized_m["avg_time"] > 0 else float("inf")

        result = {
            "label": label,
            "naive": naive_m,
            "optimized": optimized_m,
            "speedup": speedup,
        }
        section_b_results.append(result)

        color = GREEN if speedup >= 1.5 else YELLOW if speedup >= 1.0 else RED
        nn = naive_m["nodes_dequeued"]
        on = optimized_m["nodes_dequeued"]
        print(f"{color}{BOLD}{speedup:.2f}x{RESET}  (naive dequeued {nn:,} vs optimized {on:,} nodes)")

    _print_result_table(section_b_results, "SECTION B")

    # ---- Combined summary ----
    all_results = section_a_results + section_b_results
    _print_summary(all_results)

    # ---- Generate charts ----
    chart_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "benchmark_results")
    _print_section("GENERATING CHARTS")
    _generate_charts(section_a_results, section_b_results, chart_dir)

    print(f"\n  {GREEN}{BOLD}+ Benchmark complete!{RESET}")
    print(f"  {DIM}Charts saved to: {chart_dir}{RESET}\n")


if __name__ == "__main__":
    main()

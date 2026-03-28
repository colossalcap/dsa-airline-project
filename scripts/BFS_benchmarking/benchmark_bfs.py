"""
============================================================================
                    BFS Performance Benchmark Suite
           Array Queue (list.pop(0)) vs BlockQueue (Unrolled Linked List)
============================================================================

This script benchmarks two BFS implementations that use IDENTICAL algorithmic
logic. The ONLY difference is the queue data structure:

  1. ARRAY QUEUE BFS  - Uses a plain Python `list` as a FIFO queue.
                        `list.pop(0)` is O(n) because every remaining element
                        must be shifted left after the removal.

  2. BLOCK QUEUE BFS  - Uses the BlockQueue (Unrolled Linked List) from the
                        project. Achieves O(1) amortized enqueue/dequeue via
                        fixed-size blocks linked together.

Both implementations share the SAME algorithmic optimizations:
  - Pre-enqueue visited marking (no duplicate nodes in the queue)
  - Early-exit pruning (break when depth > max_stops)

This isolates the performance impact of the queue data structure itself.

The benchmark has three sections:

  Section A: Real-World Flight Graph
      Tests both implementations against the actual airline route dataset
      with varying starting airports and stop counts.

  Section B: Synthetic Scaling Test
      Generates progressively larger highly-connected random graphs to
      isolate and magnify the O(n) vs O(1) dequeue difference at scale.

  Section C: Raw Queue Operations Micro-Benchmark
      Directly benchmarks enqueue/dequeue operations on plain lists vs
      BlockQueue with increasing element counts (10K to 500K) to clearly
      demonstrate the O(n) vs O(1) dequeue cost in isolation.

Metrics captured per run:
  - Wall-clock time  (seconds)
  - Peak memory usage (MB)
  - Total nodes dequeued

Usage:
    python scripts/BFS_benchmarking/benchmark_bfs.py

Output:
    - Formatted table printed to the terminal
    - Bar charts saved to  scripts/BFS_benchmarking/benchmark_results/
"""

import sys
import os
import time
import tracemalloc
import random

# -----------------------------------------------------------------------
# Path setup - allow imports from the project root
# -----------------------------------------------------------------------
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, PROJECT_ROOT)

from app.services.data_store import load_flight_data, flight_graph, airport_names
from app.services.bfs import BlockQueue


# ======================================================================
#  1.  ARRAY QUEUE BFS  (uses plain Python list as FIFO queue)
# ======================================================================

def array_queue_bfs(graph, start, max_stops=2):
    """
    BFS using a plain Python list as a FIFO queue.

    This uses the SAME algorithmic logic as the BlockQueue version:
      - Pre-enqueue visited marking (no duplicate nodes)
      - Early-exit pruning (break when depth > max_stops)

    The ONLY difference is the queue data structure:
      - Enqueue:  list.append()  -> O(1) amortized
      - Dequeue:  list.pop(0)    -> O(n) because every remaining element
                                    must be shifted left after removal
    """
    reachable = {}
    visited = {start}          # Pre-seeded: identical to BlockQueue version
    nodes_dequeued = 0

    # Plain Python list used as a queue
    queue = [(start, 0)]

    while len(queue) > 0:
        # O(n) removal from the front - every element behind index 0
        # must be copied one position to the left.
        current, depth = queue.pop(0)
        nodes_dequeued += 1

        # EARLY EXIT - identical to BlockQueue version.
        # BFS processes nodes level-by-level, so once depth > max_stops,
        # all remaining nodes are also past the limit.
        if depth > max_stops:
            break

        if current in graph:
            for neighbor_data in graph[current]:
                neighbor = neighbor_data[0] if isinstance(neighbor_data, tuple) else neighbor_data
                # PRE-ENQUEUE check: identical to BlockQueue version.
                # Only enqueue if not already visited.
                if neighbor not in visited:
                    visited.add(neighbor)
                    next_depth = depth + 1
                    if next_depth <= max_stops:
                        if next_depth not in reachable:
                            reachable[next_depth] = []
                        reachable[next_depth].append(neighbor)
                        queue.append((neighbor, next_depth))

    return reachable, nodes_dequeued


# ======================================================================
#  2.  BLOCK QUEUE BFS  (uses BlockQueue from the project)
# ======================================================================

def block_queue_bfs(graph, start, max_stops=2):
    """
    BFS using the BlockQueue (Unrolled Linked List).

    This uses the SAME algorithmic logic as the array queue version:
      - Pre-enqueue visited marking (no duplicate nodes)
      - Early-exit pruning (break when depth > max_stops)

    The ONLY difference is the queue data structure:
      - Enqueue:  BlockQueue.enqueue()  -> O(1) amortized
      - Dequeue:  BlockQueue.dequeue()  -> O(1) amortized
      - Fixed-size blocks for CPU cache locality
      - __slots__ on block nodes for reduced memory overhead
      - Reference nulling on dequeue to prevent memory leaks
    """
    reachable = {}
    visited = {start}          # Pre-seeded: identical to array version
    nodes_dequeued = 0

    queue = BlockQueue()
    queue.enqueue((start, 0))

    while queue:
        current, depth = queue.dequeue()
        nodes_dequeued += 1

        # EARLY EXIT - identical to array version.
        if depth > max_stops:
            break

        if current in graph:
            for neighbor_data in graph[current]:
                neighbor = neighbor_data[0] if isinstance(neighbor_data, tuple) else neighbor_data
                # PRE-ENQUEUE check: identical to array version.
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
#  5.  RAW QUEUE OPERATIONS BENCHMARK
# ======================================================================

def _benchmark_raw_queue_ops(num_elements, timed_runs=3):
    """
    Directly benchmark enqueue + dequeue operations for both data structures.
    
    This isolates the pure queue performance by:
      1. Enqueueing `num_elements` items
      2. Dequeueing all `num_elements` items
    
    Returns timing and memory for both array (list) and BlockQueue.
    """
    items = list(range(num_elements))

    # ---- Array (list.pop(0)) ----
    array_times = []
    array_peak_mem = 0
    for _ in range(timed_runs):
        tracemalloc.start()
        t0 = time.perf_counter()

        q = []
        for item in items:
            q.append(item)
        while len(q) > 0:
            q.pop(0)

        t1 = time.perf_counter()
        _, mem_peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        array_times.append(t1 - t0)
        array_peak_mem = max(array_peak_mem, mem_peak)

    # ---- BlockQueue ----
    block_times = []
    block_peak_mem = 0
    for _ in range(timed_runs):
        tracemalloc.start()
        t0 = time.perf_counter()

        q = BlockQueue()
        for item in items:
            q.enqueue(item)
        while q:
            q.dequeue()

        t1 = time.perf_counter()
        _, mem_peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        block_times.append(t1 - t0)
        block_peak_mem = max(block_peak_mem, mem_peak)

    return {
        "array_queue": {
            "avg_time": sum(array_times) / len(array_times),
            "peak_memory_mb": array_peak_mem / (1024 * 1024),
        },
        "block_queue": {
            "avg_time": sum(block_times) / len(block_times),
            "peak_memory_mb": block_peak_mem / (1024 * 1024),
        },
    }


# ======================================================================
#  6.  CHART GENERATION
# ======================================================================

def _generate_charts(section_a_results, section_b_results, section_c_results, output_dir):
    """Generate bar charts for all benchmark sections."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("\n  [!] matplotlib not installed - skipping chart generation.")
        print("      Install with:  pip install matplotlib\n")
        return

    os.makedirs(output_dir, exist_ok=True)

    CLR_ARRAY = "#e74c3c"
    CLR_BLOCK = "#2ecc71"
    bar_width = 0.35

    # ---- Chart 1: Section A - Execution Time ----
    if section_a_results:
        labels = [f"{r['start']} (s={r['max_stops']})" for r in section_a_results]
        array_times = [r["array_queue"]["avg_time"] * 1000 for r in section_a_results]
        block_times = [r["block_queue"]["avg_time"] * 1000 for r in section_a_results]
        speedups = [r["speedup"] for r in section_a_results]
        x = list(range(len(labels)))

        fig, ax = plt.subplots(figsize=(max(12, len(labels) * 1.8), 6))
        bars1 = ax.bar([i - bar_width/2 for i in x], array_times, bar_width,
                       label="Array Queue (list.pop(0))", color=CLR_ARRAY, edgecolor="white")
        bars2 = ax.bar([i + bar_width/2 for i in x], block_times, bar_width,
                       label="BlockQueue (Unrolled Linked List)", color=CLR_BLOCK, edgecolor="white")

        for bar, spd in zip(bars2, speedups):
            ax.annotate(f"{spd:.1f}x",
                        xy=(bar.get_x() + bar.get_width()/2, bar.get_height()),
                        xytext=(0, 6), textcoords="offset points",
                        ha="center", fontsize=8, fontweight="bold", color="#27ae60")

        ax.set_ylabel("Time (ms)", fontsize=12, fontweight="bold")
        ax.set_title("Section A: Flight Graph - Execution Time\n(Array Queue vs BlockQueue)", fontsize=14, fontweight="bold", pad=15)
        ax.set_xticks(x)
        ax.set_xticklabels(labels, rotation=35, ha="right", fontsize=9)
        ax.legend(fontsize=10)
        ax.grid(axis="y", linestyle="--", alpha=0.4)
        fig.tight_layout()
        fig.savefig(os.path.join(output_dir, "section_a_time.png"), dpi=150)
        plt.close(fig)
        print(f"  [+] Saved  section_a_time.png")

    # ---- Chart 2: Section A - Memory Usage ----
    if section_a_results:
        array_mem = [r["array_queue"]["peak_memory_mb"] for r in section_a_results]
        block_mem = [r["block_queue"]["peak_memory_mb"] for r in section_a_results]

        fig, ax = plt.subplots(figsize=(max(12, len(labels) * 1.8), 6))
        ax.bar([i - bar_width/2 for i in x], array_mem, bar_width,
               label="Array Queue", color=CLR_ARRAY, edgecolor="white")
        ax.bar([i + bar_width/2 for i in x], block_mem, bar_width,
               label="BlockQueue", color=CLR_BLOCK, edgecolor="white")

        ax.set_ylabel("Peak Memory (MB)", fontsize=12, fontweight="bold")
        ax.set_title("Section A: Peak Memory Usage\n(Array Queue vs BlockQueue)", fontsize=14, fontweight="bold", pad=15)
        ax.set_xticks(x)
        ax.set_xticklabels(labels, rotation=35, ha="right", fontsize=9)
        ax.legend(fontsize=10)
        ax.grid(axis="y", linestyle="--", alpha=0.4)
        fig.tight_layout()
        fig.savefig(os.path.join(output_dir, "section_a_memory.png"), dpi=150)
        plt.close(fig)
        print(f"  [+] Saved  section_a_memory.png")

    # ---- Chart 3: Section B - Scaling ----
    if section_b_results:
        labels_b = [r["label"] for r in section_b_results]
        array_times_b = [r["array_queue"]["avg_time"] * 1000 for r in section_b_results]
        block_times_b = [r["block_queue"]["avg_time"] * 1000 for r in section_b_results]
        speedups_b = [r["speedup"] for r in section_b_results]
        x_b = list(range(len(labels_b)))

        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

        # Left: execution time
        ax1.bar([i - bar_width/2 for i in x_b], array_times_b, bar_width,
                label="Array Queue", color=CLR_ARRAY, edgecolor="white")
        bars_b = ax1.bar([i + bar_width/2 for i in x_b], block_times_b, bar_width,
                         label="BlockQueue", color=CLR_BLOCK, edgecolor="white")
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
        bars_s = ax2.bar(x_b, speedups_b, color=CLR_BLOCK, edgecolor="white")
        ax2.axhline(y=1.0, color="gray", linestyle="--", linewidth=1, label="Baseline (1x)")
        for bar, spd in zip(bars_s, speedups_b):
            ax2.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.05,
                     f"{spd:.2f}x", ha="center", fontsize=10, fontweight="bold")

        ax2.set_ylabel("Speedup Factor", fontsize=11, fontweight="bold")
        ax2.set_title("BlockQueue Speedup vs Graph Size", fontsize=13, fontweight="bold")
        ax2.set_xticks(x_b)
        ax2.set_xticklabels(labels_b, rotation=30, ha="right", fontsize=9)
        ax2.legend(fontsize=9)
        ax2.grid(axis="y", linestyle="--", alpha=0.4)

        fig.suptitle("Section B: Synthetic Graph Scaling Test\n(Array Queue vs BlockQueue)", fontsize=15, fontweight="bold", y=1.02)
        fig.tight_layout()
        fig.savefig(os.path.join(output_dir, "section_b_scaling.png"), dpi=150, bbox_inches="tight")
        plt.close(fig)
        print(f"  [+] Saved  section_b_scaling.png")

    # ---- Chart 4: Section C - Raw Queue Operations ----
    if section_c_results:
        labels_c = [r["label"] for r in section_c_results]
        array_times_c = [r["array_queue"]["avg_time"] * 1000 for r in section_c_results]
        block_times_c = [r["block_queue"]["avg_time"] * 1000 for r in section_c_results]
        speedups_c = [r["speedup"] for r in section_c_results]
        x_c = list(range(len(labels_c)))

        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

        # Left: execution time
        ax1.bar([i - bar_width/2 for i in x_c], array_times_c, bar_width,
                label="list.pop(0)", color=CLR_ARRAY, edgecolor="white")
        bars_c = ax1.bar([i + bar_width/2 for i in x_c], block_times_c, bar_width,
                         label="BlockQueue.dequeue()", color=CLR_BLOCK, edgecolor="white")
        for bar, spd in zip(bars_c, speedups_c):
            ax1.annotate(f"{spd:.1f}x",
                         xy=(bar.get_x() + bar.get_width()/2, bar.get_height()),
                         xytext=(0, 6), textcoords="offset points",
                         ha="center", fontsize=9, fontweight="bold", color="#27ae60")

        ax1.set_ylabel("Time (ms)", fontsize=11, fontweight="bold")
        ax1.set_title("Enqueue + Dequeue Time", fontsize=13, fontweight="bold")
        ax1.set_xticks(x_c)
        ax1.set_xticklabels(labels_c, rotation=30, ha="right", fontsize=9)
        ax1.legend(fontsize=9)
        ax1.grid(axis="y", linestyle="--", alpha=0.4)

        # Right: speedup factor
        bars_s = ax2.bar(x_c, speedups_c, color=CLR_BLOCK, edgecolor="white")
        ax2.axhline(y=1.0, color="gray", linestyle="--", linewidth=1, label="Baseline (1x)")
        for bar, spd in zip(bars_s, speedups_c):
            ax2.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.05,
                     f"{spd:.2f}x", ha="center", fontsize=10, fontweight="bold")

        ax2.set_ylabel("Speedup Factor", fontsize=11, fontweight="bold")
        ax2.set_title("BlockQueue Speedup vs Queue Size", fontsize=13, fontweight="bold")
        ax2.set_xticks(x_c)
        ax2.set_xticklabels(labels_c, rotation=30, ha="right", fontsize=9)
        ax2.legend(fontsize=9)
        ax2.grid(axis="y", linestyle="--", alpha=0.4)

        fig.suptitle("Section C: Raw Queue Operations\nlist.pop(0) [O(n)] vs BlockQueue.dequeue() [O(1)]", fontsize=15, fontweight="bold", y=1.02)
        fig.tight_layout()
        fig.savefig(os.path.join(output_dir, "section_c_raw_ops.png"), dpi=150, bbox_inches="tight")
        plt.close(fig)
        print(f"  [+] Saved  section_c_raw_ops.png")


# ======================================================================
#  7.  PRETTY-PRINT HELPERS
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
       Array Queue (list.pop(0)) vs BlockQueue (Unrolled Linked List)
============================================================================{RESET}

  {DIM}Both BFS implementations use IDENTICAL algorithmic logic:
    - Pre-enqueue visited marking (no duplicate nodes)
    - Early-exit pruning (break when depth > max_stops)

  The ONLY variable is the queue data structure:
    - Array Queue:  list.pop(0) -> O(n) dequeue
    - BlockQueue:   O(1) amortized enqueue/dequeue{RESET}
""")


def _print_section(title):
    width = 68
    print(f"\n{BOLD}{BLUE}+{'-' * width}+{RESET}")
    print(f"{BOLD}{BLUE}|{RESET}  {BOLD}{title:<{width - 2}}{RESET}{BOLD}{BLUE}|{RESET}")
    print(f"{BOLD}{BLUE}+{'-' * width}+{RESET}")


def _print_result_table(all_results, section_name=""):
    """Print a detailed comparison table."""
    _print_section(f"{section_name} - DETAILED RESULTS")

    hdr = (f"  {'Test Case':<30}| {'Array(ms)':>10} | {'Block(ms)':>10} "
           f"| {'Speedup':>8} | {'ArrayNodes':>10} | {'BlockNodes':>10} | {'Array Mem':>9} | {'Block Mem':>9}")
    sep = f"  {'-' * 30}+{'-' * 12}+{'-' * 12}+{'-' * 10}+{'-' * 12}+{'-' * 12}+{'-' * 11}+{'-' * 10}"

    print(f"\n{DIM}{hdr}{RESET}")
    print(f"{DIM}{sep}{RESET}")

    for r in all_results:
        label = r.get("label", f"{r.get('start', '?')} (stops={r.get('max_stops', '?')})")
        at  = r["array_queue"]["avg_time"] * 1000
        bt  = r["block_queue"]["avg_time"] * 1000
        spd = r["speedup"]
        an  = r["array_queue"].get("nodes_dequeued", 0)
        bn  = r["block_queue"].get("nodes_dequeued", 0)
        am  = r["array_queue"]["peak_memory_mb"]
        bm  = r["block_queue"]["peak_memory_mb"]

        spd_color = GREEN if spd >= 1.5 else YELLOW if spd >= 1.0 else RED
        print(
            f"  {label:<30}| {at:>8.2f}ms | {bt:>8.2f}ms "
            f"| {spd_color}{BOLD}{spd:>6.2f}x{RESET} | {an:>10,} | {bn:>10,} | {am:>7.2f}MB | {bm:>7.2f}MB"
        )

    print()


def _print_raw_ops_table(results):
    """Print the raw queue operations comparison table."""
    _print_section("SECTION C - DETAILED RESULTS")

    hdr = (f"  {'Queue Size':<20}| {'list.pop(0)':>12} | {'BlockQueue':>12} "
           f"| {'Speedup':>8} | {'Array Mem':>9} | {'Block Mem':>9}")
    sep = f"  {'-' * 20}+{'-' * 14}+{'-' * 14}+{'-' * 10}+{'-' * 11}+{'-' * 10}"

    print(f"\n{DIM}{hdr}{RESET}")
    print(f"{DIM}{sep}{RESET}")

    for r in results:
        label = r["label"]
        at  = r["array_queue"]["avg_time"] * 1000
        bt  = r["block_queue"]["avg_time"] * 1000
        spd = r["speedup"]
        am  = r["array_queue"]["peak_memory_mb"]
        bm  = r["block_queue"]["peak_memory_mb"]

        spd_color = GREEN if spd >= 1.5 else YELLOW if spd >= 1.0 else RED
        print(
            f"  {label:<20}| {at:>10.2f}ms | {bt:>10.2f}ms "
            f"| {spd_color}{BOLD}{spd:>6.2f}x{RESET} | {am:>7.2f}MB | {bm:>7.2f}MB"
        )

    print()


def _print_summary(all_results, section_c_results):
    """Print overall summary."""
    _print_section("OVERALL SUMMARY")

    speedups = [r["speedup"] for r in all_results]
    avg_speedup = sum(speedups) / len(speedups) if speedups else 0
    max_speedup = max(speedups) if speedups else 0
    min_speedup = min(speedups) if speedups else 0

    if speedups:
        best_case = next(r for r in all_results if r["speedup"] == max_speedup)
        best_label = best_case.get("label", f"{best_case.get('start', '?')}, stops={best_case.get('max_stops', '?')}")
    else:
        best_label = "N/A"

    print(f"""
  {BOLD}BFS Benchmark (Sections A + B):{RESET}
  {BOLD}  Average Speedup:{RESET}  {GREEN}{BOLD}{avg_speedup:.2f}x{RESET}  faster
  {BOLD}  Best Speedup:{RESET}     {GREEN}{BOLD}{max_speedup:.2f}x{RESET}  faster  ({best_label})
  {BOLD}  Worst Speedup:{RESET}    {YELLOW}{BOLD}{min_speedup:.2f}x{RESET}  faster
""")

    if section_c_results:
        c_speedups = [r["speedup"] for r in section_c_results]
        c_avg = sum(c_speedups) / len(c_speedups)
        c_max = max(c_speedups)
        c_best = next(r for r in section_c_results if r["speedup"] == c_max)
        print(f"""  {BOLD}Raw Queue Operations (Section C):{RESET}
  {BOLD}  Average Speedup:{RESET}  {GREEN}{BOLD}{c_avg:.2f}x{RESET}  faster
  {BOLD}  Best Speedup:{RESET}     {GREEN}{BOLD}{c_max:.2f}x{RESET}  faster  ({c_best['label']})
""")

    _print_section("WHY BLOCKQUEUE IS FASTER")
    print(f"""
  {BOLD}The Array Queue Problem:{RESET}
  {DIM}Python's `list.pop(0)` removes the first element and then shifts every
  remaining element one position to the left. This is an O(n) operation.
  As the queue grows larger (more nodes to explore), each dequeue becomes
  progressively slower.{RESET}

  {BOLD}The BlockQueue Solution:{RESET}
  {DIM}The BlockQueue (Unrolled Linked List) stores elements in fixed-size
  blocks of 64 items linked together. Dequeuing simply advances a read
  pointer within the current block - no shifting required. When a block
  is fully consumed, the queue moves to the next block in O(1).{RESET}

  {BOLD}Key BlockQueue Advantages:{RESET}

  {BOLD}1. O(1) Amortized Enqueue and Dequeue{RESET}
     {DIM}No element shifting on dequeue. The read pointer simply advances.{RESET}

  {BOLD}2. CPU Cache Locality{RESET}
     {DIM}Elements within a block are stored in a contiguous Python list.
     Sequential access patterns benefit from CPU cache prefetching,
     unlike a traditional linked list where each node may be scattered
     in memory.{RESET}

  {BOLD}3. __slots__ on Block Nodes{RESET}
     {DIM}Eliminates per-instance __dict__, reducing memory by ~40-60 bytes
     per block node object.{RESET}

  {BOLD}4. Reference Nulling on Dequeue{RESET}
     {DIM}Cleared references allow Python's GC to reclaim memory sooner,
     preventing leaks during long traversals.{RESET}

  {BOLD}5. Block Reuse{RESET}
     {DIM}When the last remaining block is fully consumed, its pointers are
     reset to 0 and the block is reused - avoiding the cost of allocating
     a new block.{RESET}
""")


# ======================================================================
#  8.  MAIN
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

        array_m = _run_single(array_queue_bfs, flight_graph, start, stops)
        block_m = _run_single(block_queue_bfs, flight_graph, start, stops)

        speedup = array_m["avg_time"] / block_m["avg_time"] if block_m["avg_time"] > 0 else float("inf")

        result = {
            "start": start,
            "max_stops": stops,
            "label": label,
            "array_queue": array_m,
            "block_queue": block_m,
            "speedup": speedup,
        }
        section_a_results.append(result)

        color = GREEN if speedup >= 1.5 else YELLOW if speedup >= 1.0 else RED
        print(f"{color}{BOLD}{speedup:.2f}x{RESET}  (array {array_m['avg_time']*1000:.2f}ms vs block {block_m['avg_time']*1000:.2f}ms)")

    _print_result_table(section_a_results, "SECTION A")

    # ==================================================================
    # SECTION B: Synthetic scaling test (larger graphs, more edges)
    # ==================================================================
    _print_section("SECTION B: SYNTHETIC GRAPH SCALING TEST")
    print(f"  {DIM}Generating random graphs of increasing size ...{RESET}\n")

    # Higher node counts + higher edge counts + higher max_stops to create
    # larger queues where the O(n) pop(0) penalty becomes significant.
    scaling_configs = [
        # (nodes, avg_edges_per_node, max_stops)
        (5_000,   20, 4),
        (10_000,  25, 4),
        (20_000,  30, 4),
        (50_000,  30, 4),
        (100_000, 30, 4),
    ]

    section_b_results = []
    random.seed(42)  # Reproducible results

    for i, (num_nodes, avg_edges, max_stops) in enumerate(scaling_configs, 1):
        label = f"{num_nodes:,} nodes"
        print(f"  [{i}/{len(scaling_configs)}]  {BOLD}{label}{RESET} (avg {avg_edges} edges, {max_stops} stops) ... ", end="", flush=True)

        syn_graph, syn_start = _generate_synthetic_graph(num_nodes, avg_edges)

        array_m = _run_single(array_queue_bfs, syn_graph, syn_start, max_stops, warmup_runs=1, timed_runs=3)
        block_m = _run_single(block_queue_bfs, syn_graph, syn_start, max_stops, warmup_runs=1, timed_runs=3)

        speedup = array_m["avg_time"] / block_m["avg_time"] if block_m["avg_time"] > 0 else float("inf")

        result = {
            "label": label,
            "array_queue": array_m,
            "block_queue": block_m,
            "speedup": speedup,
        }
        section_b_results.append(result)

        color = GREEN if speedup >= 1.5 else YELLOW if speedup >= 1.0 else RED
        print(f"{color}{BOLD}{speedup:.2f}x{RESET}  (array {array_m['avg_time']*1000:.2f}ms vs block {block_m['avg_time']*1000:.2f}ms)")

    _print_result_table(section_b_results, "SECTION B")

    # ==================================================================
    # SECTION C: Raw queue operations micro-benchmark
    # ==================================================================
    _print_section("SECTION C: RAW QUEUE OPERATIONS MICRO-BENCHMARK")
    print(f"  {DIM}Benchmarking pure enqueue/dequeue at increasing queue sizes ...{RESET}")
    print(f"  {DIM}This isolates the O(n) list.pop(0) vs O(1) BlockQueue.dequeue() cost.{RESET}\n")

    raw_sizes = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000]
    section_c_results = []

    for i, size in enumerate(raw_sizes, 1):
        label = f"{size:,} elements"
        print(f"  [{i}/{len(raw_sizes)}]  {BOLD}{label}{RESET} ... ", end="", flush=True)

        result = _benchmark_raw_queue_ops(size)
        speedup = result["array_queue"]["avg_time"] / result["block_queue"]["avg_time"] if result["block_queue"]["avg_time"] > 0 else float("inf")

        entry = {
            "label": label,
            "array_queue": result["array_queue"],
            "block_queue": result["block_queue"],
            "speedup": speedup,
        }
        section_c_results.append(entry)

        color = GREEN if speedup >= 1.5 else YELLOW if speedup >= 1.0 else RED
        at = result["array_queue"]["avg_time"] * 1000
        bt = result["block_queue"]["avg_time"] * 1000
        print(f"{color}{BOLD}{speedup:.2f}x{RESET}  (list: {at:.2f}ms vs BlockQueue: {bt:.2f}ms)")

    _print_raw_ops_table(section_c_results)

    # ---- Combined summary ----
    all_results = section_a_results + section_b_results
    _print_summary(all_results, section_c_results)

    # ---- Generate charts ----
    chart_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "benchmark_results")
    _print_section("GENERATING CHARTS")
    _generate_charts(section_a_results, section_b_results, section_c_results, chart_dir)

    print(f"\n  {GREEN}{BOLD}+ Benchmark complete!{RESET}")
    print(f"  {DIM}Charts saved to: {chart_dir}{RESET}\n")


if __name__ == "__main__":
    main()

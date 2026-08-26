import asyncio
import time
import urllib.request
import statistics

TARGET_URLS = [
    "http://localhost:8080/",
    "http://localhost:8080/demo",
    "http://localhost:8080/auth",
]

async def fetch_url(url: str) -> float:
    start = time.perf_counter()
    loop = asyncio.get_event_loop()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "HackSync-Benchmark-Worker/1.0"})
        await loop.run_in_executor(None, lambda: urllib.request.urlopen(req, timeout=10).read())
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return elapsed_ms
    except Exception as e:
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return elapsed_ms

async def run_benchmark(concurrency: int = 10, total_requests: int = 50):
    print("==================================================")
    print("HACKSYNC PRODUCTION LATENCY & LOAD BENCHMARK")
    print(f"Total Requests: {total_requests} | Concurrency: {concurrency}")
    print("==================================================")

    # Warmup phase
    print("Warming up server caches...")
    for url in TARGET_URLS:
        await fetch_url(url)
    await asyncio.sleep(0.5)

    tasks = []
    for i in range(total_requests):
        target = TARGET_URLS[i % len(TARGET_URLS)]
        tasks.append(fetch_url(target))

    overall_start = time.perf_counter()
    latencies = await asyncio.gather(*tasks)
    total_time = time.perf_counter() - overall_start

    valid_latencies = sorted([l for l in latencies if l > 0])
    p50 = statistics.median(valid_latencies)
    p95 = valid_latencies[int(len(valid_latencies) * 0.95)]
    p99 = valid_latencies[int(len(valid_latencies) * 0.99)]
    avg = statistics.mean(valid_latencies)
    rps = total_requests / total_time

    print(f"\n[STEADY-STATE BENCHMARK RESULTS]")
    print(f"  • Total Requests Processed : {len(valid_latencies)}")
    print(f"  • Total Wall Time          : {total_time:.2f}s")
    print(f"  • Requests Per Second (RPS): {rps:.2f} req/s")
    print(f"  • Minimum Latency          : {min(valid_latencies):.2f} ms")
    print(f"  • Average Latency          : {avg:.2f} ms")
    print(f"  • P50 Latency (Median)     : {p50:.2f} ms")
    print(f"  • P95 Latency (95th %ile)  : {p95:.2f} ms")
    print(f"  • P99 Latency (99th %ile)  : {p99:.2f} ms")
    print(f"  • Maximum Latency          : {max(valid_latencies):.2f} ms")
    print("==================================================")

if __name__ == "__main__":
    asyncio.run(run_benchmark(concurrency=10, total_requests=50))

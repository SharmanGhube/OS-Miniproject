# OS Visualizer 3D

A tiny computer you can watch think. A Next.js + three.js app that animates the OS process life cycle, CPU scheduling, paging and deadlock avoidance in an isometric 3D style.

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 73 engine tests (textbook answers + kernel invariants)
npm run build      # production build
```

- `/computer`: Virtual Computer (try `/computer?preset=memory&play=1`)
- `/labs/scheduling`: FCFS, SJF, SRTF, RR, Priority
- `/labs/page-replacement`: FIFO, LRU, OPT and Belady's anomaly
- `/labs/memory`: fixed and dynamic partitioning, fit strategies, fragmentation, compaction
- `/labs/sync`: Producer–Consumer with semaphores, and a race-condition mode
- `/labs/bankers`: safety algorithm and resource requests
- `/labs/deadlock`: resource allocation graph, detection algorithm, recovery

The plan, architecture and next steps are in [docs/implementation_plan.md](docs/implementation_plan.md).

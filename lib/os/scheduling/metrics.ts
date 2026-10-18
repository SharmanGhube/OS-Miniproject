export interface LabProcess {
  pid: number;
  name: string;
  arrival: number;
  burst: number;
  priority: number;
}

export interface LabSegment {
  pid: number | null;
  start: number;
  end: number;
}

export interface ProcessMetrics {
  pid: number;
  name: string;
  arrival: number;
  burst: number;
  priority: number;
  completion: number;
  turnaround: number;
  waiting: number;
  response: number;
}

export interface ScheduleResult {
  segments: LabSegment[];
  rows: ProcessMetrics[];
  avg: { turnaround: number; waiting: number; response: number };
  makespan: number;
  cpuUtilization: number;
  throughput: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** CT, TAT = CT − AT, WT = TAT − BT, RT = first start − AT. */
export function computeMetrics(
  procs: LabProcess[],
  segments: LabSegment[],
  firstStart: Map<number, number>,
  completion: Map<number, number>,
): ScheduleResult {
  const rows = procs.map((p) => {
    const ct = completion.get(p.pid) ?? 0;
    const tat = ct - p.arrival;
    return {
      pid: p.pid,
      name: p.name,
      arrival: p.arrival,
      burst: p.burst,
      priority: p.priority,
      completion: ct,
      turnaround: tat,
      waiting: tat - p.burst,
      response: (firstStart.get(p.pid) ?? 0) - p.arrival,
    };
  });
  const makespan = segments.length ? segments[segments.length - 1].end : 0;
  const busy = segments.filter((s) => s.pid !== null).reduce((a, s) => a + s.end - s.start, 0);
  return {
    segments,
    rows,
    avg: {
      turnaround: mean(rows.map((r) => r.turnaround)),
      waiting: mean(rows.map((r) => r.waiting)),
      response: mean(rows.map((r) => r.response)),
    },
    makespan,
    cpuUtilization: makespan ? busy / makespan : 0,
    throughput: makespan ? rows.length / makespan : 0,
  };
}

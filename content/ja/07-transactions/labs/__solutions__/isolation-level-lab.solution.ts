type IsolationLevel = "read-committed" | "snapshot" | "serializable";
type Anomaly = "dirty-read" | "dirty-write" | "read-skew" | "write-skew";
type Outcome = "occurs" | "prevented";

const PREVENTED_AT: Record<Anomaly, ReadonlySet<IsolationLevel>> = {
  "dirty-read": new Set(["read-committed", "snapshot", "serializable"]),
  "dirty-write": new Set(["read-committed", "snapshot", "serializable"]),
  "read-skew": new Set(["snapshot", "serializable"]),
  "write-skew": new Set(["serializable"]),
};

export function predictOutcome(isolationLevel: IsolationLevel, anomaly: Anomaly): Outcome {
  return PREVENTED_AT[anomaly].has(isolationLevel) ? "prevented" : "occurs";
}
